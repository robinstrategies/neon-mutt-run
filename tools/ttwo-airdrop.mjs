#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const GSA_CONTRACT = "0xb4396384569cf9b00058edb11d6bf12a626e1e18";
const ROBINHOOD_ASSETS_API = "https://api.robinhood.com/rhj/assets";
const ROBINHOOD_CHAIN_ID = 4663n;
const ROBINHOOD_CHAIN_NAME = "Robinhood Chain";
const DEFAULT_RPC = "https://rpc.mainnet.chain.robinhood.com";
const DEFAULT_STOCK_SYMBOL = "TTWO";
const DEFAULT_MIN_GSA_BALANCE = "100000";
const GSA_DECIMALS = 18;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";
const HTTP_HEADERS = {
  accept: "application/json",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 GSAAirdrop/1.0",
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

const HELP = `
GSA -> TTWO Robinhood Chain airdrop tool

Splits TTWO stock-token balance across GSA holders by their GSA holder weight.

Dry-run planner only. It does not ask for wallet secrets or send real assets.
Use the Rabby claim-vault admin page for real TTWO movement.

Examples:
  node tools/ttwo-airdrop.mjs
  node tools/ttwo-airdrop.mjs --from 0xYourWallet --budget 10
  node tools/ttwo-airdrop.mjs --snapshot snapshots/gsa-airdrop-plan.json --from 0xYourWallet --budget all

Options:
  --snapshot <path>           Existing snapshot CSV/JSON from robinhood-holder-snapshot.
                              If omitted, creates a fresh current GSA holder snapshot.
  --fresh-snapshot            Allow planning from a freshly generated current snapshot.
  --from <address>            Wallet address to read TTWO balance from in dry-run mode.
  --budget <amount|all>       TTWO amount to split. Default: all.
  --stock-symbol <symbol>     Stock-token symbol to fetch from Robinhood assets. Default: TTWO.
  --stock-token <address>     Override stock-token contract address.
  --rpc <url>                 Robinhood Chain JSON-RPC URL.
  --exclude <addresses>       Comma-separated addresses to exclude. Can repeat.
  --include-contracts         Include contract wallets from the GSA snapshot.
  --include-sender            Include the sending wallet if it is a GSA holder.
  --min-gsa-balance <amount>  Minimum GSA required to receive TTWO. Default: ${DEFAULT_MIN_GSA_BALANCE}.
                              Use 0 only if you intentionally want every holder.
  --min-allocation <amount>   Skip recipients below this TTWO allocation.
  --max-recipients <number>   Limit recipients, useful for testing.
  --start-at <rank>           Resume from a plan rank.
  --out <path>                Write plan CSV. Default: snapshots/gsa-ttwo-airdrop-plan-*.csv
  --quiet                     Less progress output.
  --help                      Show this help.
`;

function parseArgs(argv) {
  const options = {
    snapshot: "",
    freshSnapshot: false,
    from: "",
    budget: "all",
    stockSymbol: DEFAULT_STOCK_SYMBOL,
    stockToken: "",
    rpc: DEFAULT_RPC,
    exclude: [],
    includeContracts: false,
    includeSender: false,
    minGsaBalance: DEFAULT_MIN_GSA_BALANCE,
    minAllocation: "0",
    maxRecipients: Infinity,
    startAt: 1,
    out: "",
    quiet: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        die(`Missing value for ${key}`);
      }
      index += 1;
      return value;
    };

    switch (key) {
      case "--snapshot":
        options.snapshot = next();
        break;
      case "--fresh-snapshot":
        options.freshSnapshot = true;
        break;
      case "--from":
        options.from = next();
        break;
      case "--budget":
        options.budget = next();
        break;
      case "--stock-symbol":
        options.stockSymbol = next().toUpperCase();
        break;
      case "--stock-token":
        options.stockToken = next();
        break;
      case "--rpc":
        options.rpc = next();
        break;
      case "--exclude":
        options.exclude.push(...next().split(",").map((item) => item.trim()).filter(Boolean));
        break;
      case "--include-contracts":
        options.includeContracts = true;
        break;
      case "--include-sender":
        options.includeSender = true;
        break;
      case "--min-gsa-balance":
        options.minGsaBalance = next();
        break;
      case "--min-allocation":
        options.minAllocation = next();
        break;
      case "--max-recipients":
        options.maxRecipients = parsePositiveInteger(next(), "--max-recipients");
        break;
      case "--start-at":
        options.startAt = parsePositiveInteger(next(), "--start-at");
        break;
      case "--send":
        die("Real sends from this CLI are disabled. Use /claims-admin.html with Rabby and the claim vault.");
        break;
      case "--out":
        options.out = next();
        break;
      case "--quiet":
        options.quiet = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        die(`Unknown option: ${key}`);
    }
  }

  if (options.stockToken) {
    options.stockToken = normalizeAddress(options.stockToken, "--stock-token");
  }

  if (options.from) {
    options.from = normalizeAddress(options.from, "--from");
  }

  for (const address of options.exclude) {
    normalizeAddress(address, "--exclude");
  }

  return options;
}

function die(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function log(options, message) {
  if (!options.quiet) {
    console.error(message);
  }
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    die(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    die(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function normalizeAddress(value, label = "address") {
  const lowered = String(value || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lowered)) {
    die(`${label} is not a valid EVM address: ${value}`);
  }
  return lowered;
}

async function loadEthers() {
  try {
    return await import("ethers");
  } catch {
    die("Missing dependency: ethers. Run `npm install` first.");
  }
}

async function fetchJson(url, { timeoutMs = 30_000, retries = 3 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: HTTP_HEADERS,
        signal: controller.signal,
      });
      const text = await response.text();

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
      }

      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(600 * attempt);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function getStockToken(options) {
  if (options.stockToken) {
    return {
      address: options.stockToken,
      symbol: options.stockSymbol,
      name: `${options.stockSymbol} stock token`,
      decimals: null,
      source: "manual",
    };
  }

  const data = await fetchJson(ROBINHOOD_ASSETS_API);
  const asset = (data.assets || []).find((item) => String(item.tokenSymbol || "").toUpperCase() === options.stockSymbol);

  if (!asset) {
    die(`Could not find ${options.stockSymbol} in Robinhood assets API. Use --stock-token <address>.`);
  }

  const deployment = (asset.deployments || []).find((item) => BigInt(item.chainId) === ROBINHOOD_CHAIN_ID);

  if (!deployment?.contractAddress) {
    die(`Could not find ${options.stockSymbol} deployment on ${ROBINHOOD_CHAIN_NAME}. Use --stock-token <address>.`);
  }

  return {
    address: normalizeAddress(deployment.contractAddress, `${options.stockSymbol} contract`),
    symbol: asset.tokenSymbol || options.stockSymbol,
    name: asset.tokenName || `${options.stockSymbol} stock token`,
    decimals: Number(asset.tokenDecimals ?? 18),
    isin: asset.isin || "",
    source: ROBINHOOD_ASSETS_API,
  };
}

async function loadSnapshotRows(options) {
  if (options.snapshot) {
    return readSnapshotFile(options.snapshot);
  }

  log(options, "No snapshot file supplied; creating fresh current GSA holder snapshot...");
  return createFreshSnapshot(options);
}

async function readSnapshotFile(path) {
  const absolutePath = resolve(path);
  const extension = extname(absolutePath).toLowerCase();
  const text = await readFile(absolutePath, "utf8");

  if (extension === ".json") {
    const data = JSON.parse(text);
    const rows = Array.isArray(data.rows) ? data.rows : data;
    return rows.map(normalizeSnapshotRow).filter(Boolean);
  }

  if (extension === ".csv") {
    return parseCsv(text).map(normalizeSnapshotRow).filter(Boolean);
  }

  die("Snapshot must be .json or .csv");
}

async function createFreshSnapshot(options) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = resolve(tmpdir(), `gsa-fresh-holder-snapshot-${stamp}.json`);
  const csvPath = resolve(tmpdir(), `gsa-fresh-holder-snapshot-${stamp}.csv`);
  const toolPath = resolve(dirname(fileURLToPath(import.meta.url)), "robinhood-holder-snapshot.mjs");
  const args = [toolPath, "--json", jsonPath, "--out", csvPath, "--quiet", "--min-balance", options.minGsaBalance];

  if (!options.includeContracts) {
    args.push("--exclude-contracts");
  }

  await runNode(args);
  const snapshot = JSON.parse(await readFile(jsonPath, "utf8"));
  return snapshot.rows.map(normalizeSnapshotRow).filter(Boolean);
}

function runNode(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(stderr || `Snapshot command exited with ${code}`));
      }
    });
  });
}

function parseCsv(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);

  if (lines.length < 2) {
    return rows;
  }

  const headers = splitCsvLine(lines[0]);

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function normalizeSnapshotRow(row) {
  if (!row?.address) {
    return null;
  }

  const balanceRaw = BigInt(row.balance_raw ?? row.balanceRaw ?? 0);

  if (balanceRaw <= 0n) {
    return null;
  }

  return {
    rank: Number(row.rank || 0),
    address: normalizeAddress(row.address, "snapshot address"),
    balanceRaw,
    balanceGsa: row.balance_gsa || row.balanceGsa || "",
    isContract: parseMaybeBoolean(row.is_contract ?? row.isContract),
    label: row.label || "",
  };
}

function parseMaybeBoolean(value) {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return "";
}

async function getWalletAndToken(options, stock, ethers) {
  const { Contract, JsonRpcProvider, getAddress } = ethers;
  const provider = new JsonRpcProvider(options.rpc);
  const network = await provider.getNetwork();

  if (network.chainId !== ROBINHOOD_CHAIN_ID) {
    die(`RPC is chain ID ${network.chainId}; expected ${ROBINHOOD_CHAIN_ID} (${ROBINHOOD_CHAIN_NAME}).`);
  }

  const sender = options.from;

  if (options.budget === "all" && !sender) {
    die("--budget all needs --from <address> for dry-run planning.");
  }

  const tokenRead = new Contract(stock.address, ERC20_ABI, provider);
  const decimals = stock.decimals ?? Number(await tokenRead.decimals());
  const symbol = await tokenRead.symbol().catch(() => stock.symbol);
  const name = await tokenRead.name().catch(() => stock.name);
  const senderChecksum = sender ? getAddress(sender) : "";
  const tokenBalanceRaw = sender
    ? BigInt(await tokenRead.balanceOf(senderChecksum))
    : 0n;
  const nativeBalanceRaw = sender
    ? BigInt(await provider.getBalance(senderChecksum))
    : 0n;

  return {
    provider,
    sender: senderChecksum,
    tokenRead,
    decimals,
    symbol,
    name,
    tokenBalanceRaw,
    nativeBalanceRaw,
  };
}

function buildPlan(rows, options, tokenContext, ethers) {
  const excluded = new Set([ZERO_ADDRESS, DEAD_ADDRESS, ...options.exclude.map((item) => normalizeAddress(item))]);
  const senderLower = tokenContext.sender ? tokenContext.sender.toLowerCase() : "";
  const minGsaBalanceRaw = ethers.parseUnits(options.minGsaBalance, GSA_DECIMALS);

  if (senderLower && !options.includeSender) {
    excluded.add(senderLower);
  }

  const eligible = rows
    .filter((row) => row.balanceRaw >= minGsaBalanceRaw)
    .filter((row) => !excluded.has(row.address))
    .filter((row) => options.includeContracts || row.isContract !== true)
    .sort((left, right) => compareBigIntDesc(left.balanceRaw, right.balanceRaw));

  let budgetRaw;

  if (options.budget.toLowerCase() === "all") {
    budgetRaw = tokenContext.tokenBalanceRaw;
  } else {
    budgetRaw = ethers.parseUnits(options.budget, tokenContext.decimals);
  }

  if (budgetRaw <= 0n) {
    die(`No ${tokenContext.symbol} budget available to distribute.`);
  }

  if (tokenContext.sender && budgetRaw > tokenContext.tokenBalanceRaw) {
    die(`Budget exceeds sender ${tokenContext.symbol} balance.`);
  }

  const totalWeight = eligible.reduce((sum, row) => sum + row.balanceRaw, 0n);

  if (totalWeight <= 0n) {
    die("No eligible GSA holders after filters.");
  }

  const minAllocationRaw = ethers.parseUnits(options.minAllocation, tokenContext.decimals);
  let allocated = 0n;

  let plan = eligible.map((row, index) => {
    const allocationRaw = (row.balanceRaw * budgetRaw) / totalWeight;
    allocated += allocationRaw;
    return {
      rank: index + 1,
      address: row.address,
      gsa_balance_raw: row.balanceRaw.toString(),
      gsa_balance: row.balanceGsa || "",
      ownership_pct: formatRatio(row.balanceRaw, totalWeight, 100n, 6),
      stock_symbol: tokenContext.symbol,
      stock_allocation_raw: allocationRaw.toString(),
      stock_allocation: ethers.formatUnits(allocationRaw, tokenContext.decimals),
      is_contract: row.isContract === "" ? "" : String(row.isContract),
      label: row.label || "",
      status: "planned",
      tx_hash: "",
      error: "",
    };
  });

  const remainder = budgetRaw - allocated;

  if (remainder > 0n && plan.length > 0) {
    const firstAllocation = BigInt(plan[0].stock_allocation_raw) + remainder;
    plan[0].stock_allocation_raw = firstAllocation.toString();
    plan[0].stock_allocation = ethers.formatUnits(firstAllocation, tokenContext.decimals);
  }

  plan = plan
    .filter((row) => BigInt(row.stock_allocation_raw) >= minAllocationRaw)
    .slice(0, options.maxRecipients)
    .filter((row) => row.rank >= options.startAt);

  return {
    meta: {
      chain: ROBINHOOD_CHAIN_NAME,
      chainId: Number(ROBINHOOD_CHAIN_ID),
      gsaContract: GSA_CONTRACT,
      stockToken: tokenContext.tokenRead.target,
      stockName: tokenContext.name,
      stockSymbol: tokenContext.symbol,
      stockDecimals: tokenContext.decimals,
      sender: tokenContext.sender,
      senderStockBalance: tokenContext.sender ? ethers.formatUnits(tokenContext.tokenBalanceRaw, tokenContext.decimals) : "",
      senderNativeBalance: tokenContext.sender ? ethers.formatEther(tokenContext.nativeBalanceRaw) : "",
      budget: ethers.formatUnits(budgetRaw, tokenContext.decimals),
      budgetRaw: budgetRaw.toString(),
      snapshotRows: rows.length,
      eligibleBeforeMinAndLimit: eligible.length,
      recipients: plan.length,
      includeContracts: options.includeContracts,
      includeSender: options.includeSender,
      minGsaBalance: options.minGsaBalance,
      minGsaBalanceRaw: minGsaBalanceRaw.toString(),
      minAllocation: options.minAllocation,
      startAt: options.startAt,
      createdAt: new Date().toISOString(),
      dryRun: true,
    },
    rows: plan,
  };
}

function compareBigIntDesc(left, right) {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
}

function formatRatio(value, total, multiplier, fractionDigits) {
  if (total === 0n) {
    return "0";
  }

  const scale = 10n ** BigInt(fractionDigits);
  const numerator = value * multiplier * scale;
  const whole = numerator / total;
  const base = 10n ** BigInt(fractionDigits);
  const integerPart = whole / base;
  const fractionalPart = whole % base;
  const fraction = fractionalPart.toString().padStart(fractionDigits, "0").replace(/0+$/g, "");
  return `${integerPart}${fraction ? `.${fraction}` : ""}`;
}

function defaultPlanPath(symbol) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `snapshots/gsa-${symbol.toLowerCase()}-airdrop-plan-${stamp}.csv`;
}

async function writeTextFile(path, content) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

function toCsv(rows) {
  const headers = [
    "rank",
    "address",
    "gsa_balance_raw",
    "gsa_balance",
    "ownership_pct",
    "stock_symbol",
    "stock_allocation_raw",
    "stock_allocation",
    "is_contract",
    "label",
    "status",
    "tx_hash",
    "error",
  ];

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    "",
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

async function countFileLines(path) {
  return new Promise((resolveCount, rejectCount) => {
    let lines = 0;
    createReadStream(path)
      .on("data", (chunk) => {
        for (const byte of chunk) {
          if (byte === 10) {
            lines += 1;
          }
        }
      })
      .on("end", () => resolveCount(lines))
      .on("error", rejectCount);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  const ethers = await loadEthers();
  const stock = await getStockToken(options);
  log(options, `${stock.symbol} token: ${stock.address}`);

  const rows = await loadSnapshotRows(options);
  const tokenContext = await getWalletAndToken(options, stock, ethers);
  const plan = buildPlan(rows, options, tokenContext, ethers);
  const planPath = await writeTextFile(options.out || defaultPlanPath(plan.meta.stockSymbol), toCsv(plan.rows));

  console.log(JSON.stringify({
    mode: "dry-run",
    chain: plan.meta.chain,
    sender: plan.meta.sender || undefined,
    stockToken: plan.meta.stockToken,
    stock: `${plan.meta.stockName} (${plan.meta.stockSymbol})`,
    senderStockBalance: plan.meta.senderStockBalance || undefined,
    senderNativeBalance: plan.meta.senderNativeBalance || undefined,
    budget: plan.meta.budget,
    snapshotRows: plan.meta.snapshotRows,
    recipients: plan.meta.recipients,
    planCsv: planPath,
    planRowsWithHeader: await countFileLines(planPath),
    nextStep: "Review the CSV. Use /claims-admin.html with Rabby and the claim vault for real TTWO movement.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
