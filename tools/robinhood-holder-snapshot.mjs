#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const DEFAULT_CONTRACT = "0xb4396384569cf9b00058edb11d6bf12a626e1e18";
const DEFAULT_BLOCKSCOUT = "https://robinhoodchain.blockscout.com";
const DEFAULT_RPC = "https://rpc.mainnet.chain.robinhood.com";
const DEFAULT_GSA_FROM_BLOCK = 49_987_000;
const HTTP_HEADERS = {
  accept: "application/json",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 GSAHolderSnapshot/1.0",
};
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

const HELP = `
GSA / Robinhood Chain holder snapshot tool

Creates a holder snapshot CSV/JSON for review and airdrop planning.
It does not transfer tokens, stock tokens, or funds.

Default mode uses Robinhood Chain Blockscout's indexed holders endpoint.
Use --source rpc only when you need a reproducible historical block snapshot.

Examples:
  node tools/robinhood-holder-snapshot.mjs
  node tools/robinhood-holder-snapshot.mjs --airdrop-budget 1000
  node tools/robinhood-holder-snapshot.mjs --exclude-contracts --min-balance 100
  node tools/robinhood-holder-snapshot.mjs --source rpc --to-block latest

Options:
  --contract <address>        ERC-20 token contract. Defaults to GSA.
  --source <blockscout|rpc>   Snapshot source. Default: blockscout.
  --blockscout <url>          Blockscout base URL. Default: Robinhood Chain explorer.
  --rpc <url>                 JSON-RPC URL. Default: Robinhood Chain public RPC.
  --from-block <number>       First block for RPC log scan. Defaults to GSA launch range.
  --to-block <number|latest>  Last block for RPC scan. Default: latest.
  --chunk-size <number>       RPC log block chunk size. Default: 25000.
  --page-delay-ms <number>    Delay between Blockscout pages. Default: 250.
  --max-pages <number>        Limit Blockscout pages, useful for testing.
  --max-holders <number>      Limit output holder rows, useful for testing.
  --min-balance <amount>      Minimum GSA balance to include. Default: 0.
  --exclude <addresses>       Comma-separated addresses to exclude. Can repeat.
  --exclude-contracts         Exclude addresses Blockscout marks as contracts.
  --airdrop-budget <amount>   Optional stock-token budget for pro-rata planning.
  --out <path>                CSV output path. Default: snapshots/gsa-holders-*.csv
  --json <path>               Also write a JSON snapshot file.
  --pretty                    Pretty-print JSON output.
  --quiet                     Less progress output.
  --help                      Show this help.
`;

function parseArgs(argv) {
  const options = {
    contract: DEFAULT_CONTRACT,
    source: "blockscout",
    blockscout: DEFAULT_BLOCKSCOUT,
    rpc: DEFAULT_RPC,
    fromBlock: null,
    toBlock: "latest",
    chunkSize: 25_000,
    pageDelayMs: 250,
    maxPages: Infinity,
    maxHolders: Infinity,
    minBalance: "0",
    exclude: [],
    excludeContracts: false,
    airdropBudget: "",
    out: "",
    json: "",
    pretty: false,
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
      case "--contract":
        options.contract = next();
        break;
      case "--source":
        options.source = next();
        break;
      case "--blockscout":
        options.blockscout = next().replace(/\/+$/, "");
        break;
      case "--rpc":
        options.rpc = next();
        break;
      case "--from-block":
        options.fromBlock = parseBlockNumber(next(), "--from-block");
        break;
      case "--to-block":
        options.toBlock = next();
        break;
      case "--chunk-size":
        options.chunkSize = parsePositiveInteger(next(), "--chunk-size");
        break;
      case "--page-delay-ms":
        options.pageDelayMs = parseNonNegativeInteger(next(), "--page-delay-ms");
        break;
      case "--max-pages":
        options.maxPages = parsePositiveInteger(next(), "--max-pages");
        break;
      case "--max-holders":
        options.maxHolders = parsePositiveInteger(next(), "--max-holders");
        break;
      case "--min-balance":
        options.minBalance = next();
        break;
      case "--exclude":
        options.exclude.push(...next().split(",").map((item) => item.trim()).filter(Boolean));
        break;
      case "--exclude-contracts":
        options.excludeContracts = true;
        break;
      case "--airdrop-budget":
        options.airdropBudget = next();
        break;
      case "--out":
        options.out = next();
        break;
      case "--json":
        options.json = next();
        break;
      case "--pretty":
        options.pretty = true;
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

  options.contract = normalizeAddress(options.contract, "--contract");
  options.source = options.source.toLowerCase();

  if (!["blockscout", "rpc"].includes(options.source)) {
    die("--source must be either blockscout or rpc");
  }

  if (options.source === "rpc" && options.fromBlock === null) {
    if (options.contract === DEFAULT_CONTRACT) {
      options.fromBlock = DEFAULT_GSA_FROM_BLOCK;
    } else {
      die("--source rpc requires --from-block when using a non-default contract.");
    }
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

function parseBlockNumber(value, label) {
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value, 16);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    die(`${label} must be a non-negative block number`);
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

function holderAddress(item) {
  const candidate =
    item?.address?.hash ||
    item?.address_hash?.hash ||
    item?.address_hash ||
    item?.holder?.hash ||
    item?.holder_address_hash;

  return normalizeAddress(candidate, "holder address");
}

function holderIsContract(item) {
  return Boolean(item?.address?.is_contract || item?.address_hash?.is_contract || item?.holder?.is_contract);
}

function holderLabel(item) {
  return item?.address?.name || item?.address_hash?.name || item?.holder?.name || "";
}

function toHexBlock(value) {
  if (value === "latest" || value === "earliest" || value === "pending") {
    return value;
  }
  const parsed = typeof value === "number" ? value : parseBlockNumber(String(value), "--to-block");
  return `0x${parsed.toString(16)}`;
}

function fromHexInteger(value) {
  return Number.parseInt(String(value), 16);
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

async function rpcCall(rpcUrl, method, params = [], { timeoutMs = 30_000, retries = 3 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: attempt, method, params }),
        signal: controller.signal,
      });
      const json = await response.json();

      if (!response.ok || json.error) {
        throw new Error(json.error?.message || `${response.status} ${response.statusText}`);
      }

      return json.result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(700 * attempt);
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

async function getTokenInfoFromBlockscout(options) {
  const data = await fetchJson(`${options.blockscout}/api/v2/tokens/${options.contract}`);
  return normalizeTokenInfo({
    name: data.name,
    symbol: data.symbol,
    decimals: data.decimals,
    totalSupply: data.total_supply,
    holdersCount: data.holders_count,
  });
}

async function getTokenInfoFromRpc(options) {
  const [decimals, symbol, name, totalSupply] = await Promise.all([
    safeRpcCall(options, "eth_call", [{ to: options.contract, data: "0x313ce567" }, "latest"], "0x12"),
    safeRpcCall(options, "eth_call", [{ to: options.contract, data: "0x95d89b41" }, "latest"], "0x"),
    safeRpcCall(options, "eth_call", [{ to: options.contract, data: "0x06fdde03" }, "latest"], "0x"),
    safeRpcCall(options, "eth_call", [{ to: options.contract, data: "0x18160ddd" }, "latest"], "0x0"),
  ]);

  return normalizeTokenInfo({
    name: decodeAbiString(name) || "Unknown Token",
    symbol: decodeAbiString(symbol) || "TOKEN",
    decimals: Number(BigInt(decimals || "0x12")),
    totalSupply: BigInt(totalSupply || "0x0").toString(),
    holdersCount: "",
  });
}

async function safeRpcCall(options, method, params, fallback) {
  try {
    return await rpcCall(options.rpc, method, params);
  } catch {
    return fallback;
  }
}

function normalizeTokenInfo(info) {
  const decimals = Number(info.decimals ?? 18);

  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    die(`Invalid token decimals: ${info.decimals}`);
  }

  return {
    name: info.name || "Grand Stock Auto",
    symbol: info.symbol || "GSA",
    decimals,
    totalSupply: String(info.totalSupply || "0"),
    holdersCount: String(info.holdersCount || ""),
  };
}

function decodeAbiString(hex) {
  if (!hex || hex === "0x") {
    return "";
  }

  const clean = hex.replace(/^0x/, "");

  if (clean.length === 64) {
    return Buffer.from(clean, "hex").toString("utf8").replace(/\0+$/g, "");
  }

  if (clean.length >= 128) {
    const length = Number(BigInt(`0x${clean.slice(64, 128)}`));
    const stringHex = clean.slice(128, 128 + length * 2);
    return Buffer.from(stringHex, "hex").toString("utf8").replace(/\0+$/g, "");
  }

  return "";
}

async function snapshotFromBlockscout(options) {
  const tokenInfo = await getTokenInfoFromBlockscout(options);
  const holders = [];
  let page = 0;
  let nextParams = null;

  do {
    page += 1;
    const url = new URL(`${options.blockscout}/api/v2/tokens/${options.contract}/holders`);

    if (nextParams) {
      for (const [key, value] of Object.entries(nextParams)) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    log(options, `Fetching Blockscout holders page ${page}...`);
    const data = await fetchJson(url.href);

    for (const item of data.items || []) {
      holders.push({
        address: holderAddress(item),
        balanceRaw: BigInt(item.value || 0),
        isContract: holderIsContract(item),
        label: holderLabel(item),
      });

      if (holders.length >= options.maxHolders) {
        break;
      }
    }

    nextParams = data.next_page_params || null;

    if (options.pageDelayMs > 0 && nextParams && page < options.maxPages && holders.length < options.maxHolders) {
      await sleep(options.pageDelayMs);
    }
  } while (nextParams && page < options.maxPages && holders.length < options.maxHolders);

  const snapshotBlock = await safeRpcCall(options, "eth_blockNumber", [], null);

  return {
    source: "blockscout",
    sourceUrl: options.blockscout,
    tokenInfo,
    holders,
    snapshotBlock: snapshotBlock ? fromHexInteger(snapshotBlock) : "latest-indexed",
  };
}

async function snapshotFromRpc(options) {
  const tokenInfo = await getTokenInfoFromRpc(options);
  const latestBlock = fromHexInteger(await rpcCall(options.rpc, "eth_blockNumber"));
  const toBlock = options.toBlock === "latest" ? latestBlock : parseBlockNumber(String(options.toBlock), "--to-block");

  if (options.fromBlock > toBlock) {
    die("--from-block cannot be greater than --to-block");
  }

  const balances = new Map();
  let scannedLogs = 0;

  for (let start = options.fromBlock; start <= toBlock; start += options.chunkSize) {
    const end = Math.min(start + options.chunkSize - 1, toBlock);
    log(options, `Scanning Transfer logs ${start.toLocaleString()}-${end.toLocaleString()}...`);

    const logs = await rpcCall(options.rpc, "eth_getLogs", [{
      address: options.contract,
      fromBlock: toHexBlock(start),
      toBlock: toHexBlock(end),
      topics: [TRANSFER_TOPIC],
    }], { timeoutMs: 45_000 });

    scannedLogs += logs.length;

    for (const item of logs) {
      if (!item.topics || item.topics.length < 3) {
        continue;
      }

      const from = normalizeTopicAddress(item.topics[1]);
      const to = normalizeTopicAddress(item.topics[2]);
      const value = BigInt(item.data || "0x0");

      if (from !== ZERO_ADDRESS) {
        bump(balances, from, -value);
      }

      if (to !== ZERO_ADDRESS) {
        bump(balances, to, value);
      }
    }
  }

  log(options, `Scanned ${scannedLogs.toLocaleString()} Transfer logs.`);

  return {
    source: "rpc",
    sourceUrl: options.rpc,
    tokenInfo,
    holders: Array.from(balances.entries())
      .filter(([, balanceRaw]) => balanceRaw > 0n)
      .map(([address, balanceRaw]) => ({
        address,
        balanceRaw,
        isContract: "",
        label: "",
      })),
    snapshotBlock: toBlock,
  };
}

function normalizeTopicAddress(topic) {
  return normalizeAddress(`0x${String(topic).replace(/^0x/, "").slice(-40)}`, "log topic address");
}

function bump(map, address, amount) {
  map.set(address, (map.get(address) || 0n) + amount);
}

function buildSnapshot(snapshot, options) {
  const decimals = snapshot.tokenInfo.decimals;
  const excludedAddresses = new Set([ZERO_ADDRESS, DEAD_ADDRESS]);

  for (const address of options.exclude) {
    excludedAddresses.add(normalizeAddress(address, "--exclude"));
  }

  const minBalanceRaw = parseUnits(options.minBalance, decimals, "--min-balance");
  const allPositiveHolders = snapshot.holders.filter((holder) => holder.balanceRaw > 0n);
  const eligible = allPositiveHolders
    .filter((holder) => !excludedAddresses.has(holder.address))
    .filter((holder) => holder.balanceRaw >= minBalanceRaw)
    .filter((holder) => !(options.excludeContracts && holder.isContract === true))
    .sort((left, right) => compareBigIntDesc(left.balanceRaw, right.balanceRaw))
    .slice(0, options.maxHolders);

  const totalEligibleRaw = eligible.reduce((sum, holder) => sum + holder.balanceRaw, 0n);
  const airdropBudgetScaled = options.airdropBudget
    ? parseUnits(options.airdropBudget, 8, "--airdrop-budget")
    : null;

  const rows = eligible.map((holder, index) => {
    const airdropAllocation = airdropBudgetScaled === null || totalEligibleRaw === 0n
      ? ""
      : formatUnits((holder.balanceRaw * airdropBudgetScaled) / totalEligibleRaw, 8, 8);

    return {
      rank: index + 1,
      address: holder.address,
      balance_raw: holder.balanceRaw.toString(),
      balance_gsa: formatUnits(holder.balanceRaw, decimals, 8),
      ownership_pct: formatRatio(holder.balanceRaw, totalEligibleRaw, 100n, 6),
      airdrop_weight_bps: formatRatio(holder.balanceRaw, totalEligibleRaw, 10_000n, 4),
      airdrop_allocation: airdropAllocation,
      is_contract: holder.isContract === "" ? "" : String(holder.isContract),
      label: holder.label,
      source: snapshot.source,
      token_symbol: snapshot.tokenInfo.symbol,
      token_name: snapshot.tokenInfo.name,
      snapshot_block: snapshot.snapshotBlock,
      snapshot_utc: new Date().toISOString(),
    };
  });

  return {
    meta: {
      contract: options.contract,
      chain: "Robinhood Chain",
      chainId: 4663,
      source: snapshot.source,
      sourceUrl: snapshot.sourceUrl,
      snapshotBlock: snapshot.snapshotBlock,
      createdAt: new Date().toISOString(),
      token: snapshot.tokenInfo,
      totalPositiveHolders: allPositiveHolders.length,
      eligibleHolders: rows.length,
      excludedContracts: options.excludeContracts,
      excludedAddresses: Array.from(excludedAddresses),
      minBalance: options.minBalance,
      minBalanceRaw: minBalanceRaw.toString(),
      totalEligibleRaw: totalEligibleRaw.toString(),
      totalEligibleFormatted: formatUnits(totalEligibleRaw, decimals, 8),
      airdropBudget: options.airdropBudget || "",
    },
    rows,
  };
}

function compareBigIntDesc(left, right) {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
}

function parseUnits(value, decimals, label) {
  const text = String(value || "0").trim();

  if (!/^\d+(\.\d+)?$/.test(text)) {
    die(`${label} must be a non-negative decimal number`);
  }

  const [whole, fractional = ""] = text.split(".");

  if (fractional.length > decimals) {
    die(`${label} has too many decimal places for ${decimals} decimals`);
  }

  return BigInt(`${whole}${fractional.padEnd(decimals, "0")}`);
}

function formatUnits(value, decimals, maxFractionDigits = decimals) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fractional = absolute % base;

  let fractionText = fractional.toString().padStart(decimals, "0");
  fractionText = fractionText.slice(0, maxFractionDigits).replace(/0+$/g, "");

  return `${negative ? "-" : ""}${whole.toString()}${fractionText ? `.${fractionText}` : ""}`;
}

function formatRatio(value, total, multiplier, fractionDigits) {
  if (total === 0n) {
    return "0";
  }

  const scale = 10n ** BigInt(fractionDigits);
  return formatUnits((value * multiplier * scale) / total, fractionDigits, fractionDigits);
}

function toCsv(rows) {
  const headers = [
    "rank",
    "address",
    "balance_raw",
    "balance_gsa",
    "ownership_pct",
    "airdrop_weight_bps",
    "airdrop_allocation",
    "is_contract",
    "label",
    "source",
    "token_symbol",
    "token_name",
    "snapshot_block",
    "snapshot_utc",
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

function defaultCsvPath(source) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `snapshots/gsa-holders-${source}-${stamp}.csv`;
}

async function writeTextFile(path, content) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  const rawSnapshot = options.source === "blockscout"
    ? await snapshotFromBlockscout(options)
    : await snapshotFromRpc(options);

  const snapshot = buildSnapshot(rawSnapshot, options);
  const csvPath = await writeTextFile(options.out || defaultCsvPath(options.source), toCsv(snapshot.rows));
  const jsonPath = options.json
    ? await writeTextFile(options.json, JSON.stringify(snapshot, bigintJsonReplacer, options.pretty ? 2 : 0))
    : "";

  console.log(JSON.stringify({
    contract: snapshot.meta.contract,
    source: snapshot.meta.source,
    snapshotBlock: snapshot.meta.snapshotBlock,
    token: `${snapshot.meta.token.name} (${snapshot.meta.token.symbol})`,
    totalPositiveHolders: snapshot.meta.totalPositiveHolders,
    eligibleHolders: snapshot.meta.eligibleHolders,
    totalEligibleFormatted: snapshot.meta.totalEligibleFormatted,
    csv: csvPath,
    json: jsonPath || undefined,
  }, null, 2));
}

function bigintJsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
