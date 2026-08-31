(() => {
  "use strict";

  const CONFIG = Object.freeze({
    chainIdHex: "0x1237",
    chainIdDec: 4663,
    chainName: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    gsaContract: "0xb4396384569cf9b00058edb11d6bf12a626e1e18",
    ttwoContract: "0x5e81213613b6b86eab4c6c50d718d34359459786",
    gsaDecimals: 18,
    ttwoDecimals: 18,
    gsaFromBlock: 49_987_000n,
    logChunkSize: 10_000n,
    blockscoutMaxPages: 250,
    blockscoutPageDelayMs: 120,
    rpcBatchSize: 60,
    transferTopic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    zeroAddress: "0x0000000000000000000000000000000000000000",
    deadAddress: "0x000000000000000000000000000000000000dead",
  });

  const state = {
    provider: null,
    account: "",
    snapshot: null,
    csvUrl: "",
    announcedProviders: [],
  };

  const selectors = {
    connectButton: "#connectButton",
    snapshotButton: "#snapshotButton",
    downloadCsv: "#downloadCsv",
    statusLine: "#statusLine",
    minBalance: "#minBalance",
    excludeContracts: "#excludeContracts",
    excludeSender: "#excludeSender",
    walletStat: "#walletStat",
    ttwoStat: "#ttwoStat",
    holdersStat: "#holdersStat",
    blockStat: "#blockStat",
    holderRows: "#holderRows",
  };

  const $ = (selector) => document.querySelector(selector);

  function init() {
    listenForWalletProviders();
    bindEvents();
    state.provider = getWalletProvider();
    if (state.provider) {
      setStatus("work", isMockWallet() ? "Local mock wallet ready for testing." : "Wallet detected. Connect when ready.");
    }
    renderEmpty("Connect wallet, then press Snapshot.");
  }

  function bindEvents() {
    $(selectors.connectButton).addEventListener("click", () => connectWallet().catch(handleError));
    $(selectors.snapshotButton).addEventListener("click", () => runSnapshot().catch(handleError));
    $(selectors.downloadCsv).addEventListener("click", downloadCsv);
    $(selectors.minBalance).addEventListener("change", () => {
      if (state.snapshot) {
        setStatus("work", "Minimum changed. Press Snapshot again to rebuild the table.");
      }
    });
  }

  function listenForWalletProviders() {
    window.addEventListener("eip6963:announceProvider", (event) => {
      if (event.detail?.provider) {
        state.announcedProviders.push(event.detail);
      }
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  function getWalletProvider() {
    if (isMockWallet()) {
      return createMockProvider();
    }

    const rabbyFromEip6963 = state.announcedProviders.find((item) => {
      const name = `${item.info?.name || ""} ${item.info?.rdns || ""}`.toLowerCase();
      return name.includes("rabby");
    });
    if (rabbyFromEip6963?.provider) return rabbyFromEip6963.provider;

    if (window.rabby?.ethereum) return window.rabby.ethereum;

    if (Array.isArray(window.ethereum?.providers)) {
      return window.ethereum.providers.find((provider) => provider.isRabby) || null;
    }

    return window.ethereum?.isRabby ? window.ethereum : null;
  }

  function isMockWallet() {
    const params = new URLSearchParams(window.location.search);
    const localHost = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
    return localHost && params.get("mockWallet") === "1";
  }

  function createMockProvider() {
    const mockAccount = "0x1111111111111111111111111111111111111111";
    const mockBalance = parseUnits("10", CONFIG.ttwoDecimals);
    const mockBlock = 50_060_900n;
    const requestedMockHolders = Number(new URLSearchParams(window.location.search).get("mockHolders") || "140");
    const mockHolderCount = Number.isSafeInteger(requestedMockHolders)
      ? Math.min(Math.max(requestedMockHolders, 1), 1_200)
      : 140;
    const mockHolders = new Map(Array.from({ length: mockHolderCount }, (_, index) => {
      const number = (index + 2).toString(16).padStart(40, "0");
      const balance = parseUnits(String(2_500_000 - index * 1_000), CONFIG.gsaDecimals);
      return [`0x${number}`, balance];
    }));
    return {
      isRabby: true,
      async request({ method, params }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [mockAccount];
        if (method === "eth_chainId") return CONFIG.chainIdHex;
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        if (method === "eth_blockNumber") return toQuantityHex(mockBlock);
        if (method === "eth_getLogs") {
          const range = params?.[0] || {};
          const from = hexToBigInt(range.fromBlock || "0x0");
          const to = hexToBigInt(range.toBlock || "0x0");
          if (from > CONFIG.gsaFromBlock || to < CONFIG.gsaFromBlock) return [];
          return Array.from(mockHolders.entries()).map(([address, balanceRaw], index) => ({
            address: CONFIG.gsaContract,
            blockNumber: toQuantityHex(CONFIG.gsaFromBlock),
            transactionHash: `0x${String(index + 1).padStart(64, "0")}`,
            logIndex: toQuantityHex(BigInt(index)),
            data: toUint256Hex(balanceRaw),
            topics: [
              CONFIG.transferTopic,
              `0x${CONFIG.zeroAddress.slice(2).padStart(64, "0")}`,
              `0x${address.slice(2).padStart(64, "0")}`,
            ],
          }));
        }
        if (method === "eth_call") {
          const call = params?.[0] || {};
          if (normalizeAddressSoft(call.to) === CONFIG.ttwoContract && String(call.data || "").startsWith("0x70a08231")) {
            return toUint256Hex(mockBalance);
          }
          if (normalizeAddressSoft(call.to) === CONFIG.gsaContract && String(call.data || "").startsWith("0x70a08231")) {
            const address = `0x${String(call.data).slice(-40)}`.toLowerCase();
            return toUint256Hex(mockHolders.get(address) || 0n);
          }
          return "0x" + "0".repeat(64);
        }
        if (method === "eth_getCode") return "0x";
        throw new Error(`Mock wallet does not support ${method}`);
      },
    };
  }

  async function connectWallet() {
    state.provider = getWalletProvider();
    if (!state.provider) {
      throw new Error("No wallet found. Install Rabby, then refresh this page.");
    }

    setBusy(true);
    try {
      const accounts = await state.provider.request({ method: "eth_requestAccounts" });
      const account = normalizeAddressSoft(accounts?.[0]);
      if (!account) throw new Error("Wallet did not return an account.");
      state.account = account;
      await ensureRobinhoodChain();
      $(selectors.walletStat).textContent = shortAddress(account);
      $(selectors.connectButton).textContent = "Wallet Connected";
      setStatus("good", `Connected ${shortAddress(account)} on Robinhood Chain.`);
      return account;
    } finally {
      setBusy(false);
    }
  }

  async function ensureRobinhoodChain() {
    const chainId = await state.provider.request({ method: "eth_chainId" });
    if (String(chainId).toLowerCase() === CONFIG.chainIdHex) return;

    try {
      await state.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CONFIG.chainIdHex }],
      });
    } catch (error) {
      if (error?.code !== 4902) throw error;
      await state.provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CONFIG.chainIdHex,
          chainName: CONFIG.chainName,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [CONFIG.rpcUrl],
          blockExplorerUrls: [CONFIG.explorerUrl],
        }],
      });
    }
  }

  async function runSnapshot() {
    if (!state.account) await connectWallet();

    const minRaw = parseUnits($(selectors.minBalance).value || "100000", CONFIG.gsaDecimals);
    if (minRaw <= 0n) throw new Error("Minimum GSA must be above zero.");

    setBusy(true);
    clearCsvUrl();
    renderEmpty("Building snapshot...");
    setStats({ wallet: shortAddress(state.account), ttwo: "…", holders: "…", block: "…" });

    try {
      await ensureRobinhoodChain();

      const ttwoBalanceRaw = await tokenBalanceViaWallet(CONFIG.ttwoContract, state.account);
      setStats({ ttwo: formatUnits(ttwoBalanceRaw, CONFIG.ttwoDecimals, 6) });
      if (ttwoBalanceRaw <= 0n) {
        setStatus("bad", "Connected wallet has 0 TTWO stock-tokens. Snapshot will still work, but there is nothing to send.");
      } else {
        setStatus("work", "Reading GSA transfer logs...");
      }

      const currentBlock = hexToBigInt(await chainCall("eth_blockNumber", []));
      setStats({ block: currentBlock.toString() });
      const balances = await buildHolderBalances(currentBlock);

      setStatus("work", "Filtering holders over 100k GSA...");
      let holders = Array.from(balances.entries())
        .map(([address, balanceRaw]) => ({ address, balanceRaw }))
        .filter((holder) => holder.balanceRaw >= minRaw)
        .filter((holder) => !isBurnAddress(holder.address));

      if ($(selectors.excludeSender).checked) {
        holders = holders.filter((holder) => holder.address !== state.account);
      }

      if ($(selectors.excludeContracts).checked && holders.length) {
        setStatus("work", "Checking for contract wallets...");
        holders = await excludeContractWallets(holders);
      }

      holders.sort((a, b) => compareBigIntDesc(a.balanceRaw, b.balanceRaw));

      const totalGsaRaw = holders.reduce((sum, holder) => sum + holder.balanceRaw, 0n);
      const rows = allocateTtwo(holders, totalGsaRaw, ttwoBalanceRaw);

      state.snapshot = {
        account: state.account,
        block: currentBlock,
        minRaw,
        ttwoBalanceRaw,
        totalGsaRaw,
        rows,
        createdAt: new Date().toISOString(),
      };

      setStats({
        holders: rows.length.toLocaleString(),
        block: currentBlock.toString(),
        ttwo: `${formatUnits(ttwoBalanceRaw, CONFIG.ttwoDecimals, 6)} TTWO`,
      });
      renderRows(rows);

      setStatus(
        rows.length ? "good" : "bad",
        rows.length
          ? `Snapshot ready: ${rows.length.toLocaleString()} eligible holders above ${formatUnits(minRaw, CONFIG.gsaDecimals, 0)} GSA.`
          : "No eligible holders found with the current filters."
      );
    } finally {
      setBusy(false);
    }
  }

  async function buildHolderBalances(currentBlock) {
    if (!isMockWallet()) {
      try {
        return await buildHolderBalancesFromBlockscout(currentBlock);
      } catch (error) {
        console.warn("Blockscout holder snapshot failed; falling back to direct RPC logs.", error);
        setStatus("work", "Explorer snapshot was blocked. Trying direct RPC logs...");
      }
    }

    return buildHolderBalancesFromTransferLogs(currentBlock);
  }

  async function buildHolderBalancesFromBlockscout(snapshotBlock) {
    const balances = new Map();
    let page = 0;
    let nextParams = null;

    do {
      page += 1;
      const url = new URL(`${CONFIG.explorerUrl}/api/v2/tokens/${CONFIG.gsaContract}/holders`);

      if (nextParams) {
        for (const [key, value] of Object.entries(nextParams)) {
          if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
        }
      }

      setStatus("work", `Reading holder list from explorer: page ${page}...`);
      const data = await fetchJson(url.href);
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const address = blockscoutHolderAddress(item);
        if (!address) continue;
        const balanceRaw = parseRawBigInt(item.value || item.balance || item.token?.value || "0");
        if (balanceRaw > 0n) balances.set(address, balanceRaw);
      }

      nextParams = data.next_page_params || null;
      if (nextParams) await delay(CONFIG.blockscoutPageDelayMs);
    } while (nextParams && page < CONFIG.blockscoutMaxPages);

    if (!balances.size) throw new Error("Explorer returned no GSA holders.");
    if (nextParams) throw new Error("Explorer holder list is too large for this browser snapshot.");

    setStatus("work", `Loaded ${balances.size.toLocaleString()} explorer holders.`);
    return balances;
  }

  async function buildHolderBalancesFromTransferLogs(currentBlock) {
    const balances = new Map();
    let from = CONFIG.gsaFromBlock;
    const to = currentBlock;
    let logCount = 0;

    while (from <= to) {
      const chunkTo = from + CONFIG.logChunkSize - 1n > to ? to : from + CONFIG.logChunkSize - 1n;
      setStatus("work", `Reading GSA logs: blocks ${from.toString()}–${chunkTo.toString()}...`);
      const logs = await snapshotRpcCall("eth_getLogs", [{
        fromBlock: toQuantityHex(from),
        toBlock: toQuantityHex(chunkTo),
        address: CONFIG.gsaContract,
        topics: [CONFIG.transferTopic],
      }]);
      for (const log of logs || []) {
        applyTransferLog(balances, log);
      }
      logCount += logs?.length || 0;
      from = chunkTo + 1n;
    }

    setStatus("work", `Processed ${logCount.toLocaleString()} GSA transfers. Verifying current balances...`);
    return verifyPositiveBalances(balances);
  }

  function blockscoutHolderAddress(item) {
    return normalizeAddressSoft(
      item?.address?.hash ||
      item?.address_hash?.hash ||
      item?.address_hash ||
      item?.holder?.hash ||
      item?.holder_address_hash
    );
  }

  async function verifyPositiveBalances(balances) {
    const candidates = Array.from(balances.entries())
      .filter(([, balance]) => balance > 0n)
      .map(([address]) => address);
    const verified = new Map();

    for (let index = 0; index < candidates.length; index += CONFIG.rpcBatchSize) {
      const batch = candidates.slice(index, index + CONFIG.rpcBatchSize);
      setStatus("work", `Verifying balances ${index + 1}–${Math.min(index + batch.length, candidates.length)} of ${candidates.length}...`);
      const calls = batch.map((address) => ({
        method: "eth_call",
        params: [{ to: CONFIG.gsaContract, data: encodeBalanceOf(address) }, "latest"],
      }));
      const results = await chainBatch(calls);
      for (let offset = 0; offset < batch.length; offset += 1) {
        const raw = hexToBigInt(results[offset]);
        if (raw > 0n) verified.set(batch[offset], raw);
      }
    }

    return verified;
  }

  function applyTransferLog(balances, log) {
    const from = topicToAddress(log.topics?.[1]);
    const to = topicToAddress(log.topics?.[2]);
    const value = hexToBigInt(log.data || "0x0");

    if (!from || !to || value === 0n) return;
    if (from !== CONFIG.zeroAddress) balances.set(from, (balances.get(from) || 0n) - value);
    if (to !== CONFIG.zeroAddress) balances.set(to, (balances.get(to) || 0n) + value);
  }

  async function excludeContractWallets(holders) {
    const keepers = [];
    for (let index = 0; index < holders.length; index += CONFIG.rpcBatchSize) {
      const batch = holders.slice(index, index + CONFIG.rpcBatchSize);
      const calls = batch.map((holder) => ({
        method: "eth_getCode",
        params: [holder.address, "latest"],
      }));
      const results = await chainBatch(calls);
      for (let offset = 0; offset < batch.length; offset += 1) {
        if (!results[offset] || results[offset] === "0x") {
          keepers.push(batch[offset]);
        }
      }
    }
    return keepers;
  }

  function allocateTtwo(holders, totalGsaRaw, ttwoBalanceRaw) {
    if (!holders.length || totalGsaRaw <= 0n) return [];

    let allocatedRaw = 0n;
    const rows = holders.map((holder, index) => {
      const ttwoRaw = (holder.balanceRaw * ttwoBalanceRaw) / totalGsaRaw;
      allocatedRaw += ttwoRaw;
      return {
        rank: index + 1,
        address: holder.address,
        gsaRaw: holder.balanceRaw,
        shareBps: (holder.balanceRaw * 1_000_000n) / totalGsaRaw,
        ttwoRaw,
        status: "ready",
        txHash: "",
      };
    });

    const remainder = ttwoBalanceRaw - allocatedRaw;
    if (remainder > 0n && rows[0]) {
      rows[0].ttwoRaw += remainder;
    }

    return rows;
  }

  async function tokenBalanceViaWallet(contract, owner) {
    const result = await state.provider.request({
      method: "eth_call",
      params: [{ to: contract, data: encodeBalanceOf(owner) }, "latest"],
    });
    return hexToBigInt(result);
  }

  async function chainCall(method, params) {
    if (state.provider) {
      if (isMockWallet() || !isReadOnlyRpcMethod(method)) return state.provider.request({ method, params });
      try {
        return await state.provider.request({ method, params });
      } catch (error) {
        console.warn(`Wallet RPC ${method} failed; retrying public RPC.`, error);
      }
    }

    const response = await fetch(CONFIG.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const payload = await readJsonResponse(response, "Robinhood RPC request");
    if (payload.error) throw new Error(payload.error.message || "Robinhood RPC error");
    return payload.result;
  }

  async function chainBatch(calls) {
    if (state.provider) {
      const results = [];
      for (const call of calls) {
        results.push(await chainCall(call.method, call.params));
      }
      return results;
    }

    const payload = calls.map((call, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method: call.method,
      params: call.params,
    }));
    const response = await fetch(CONFIG.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const results = await readJsonResponse(response, "Robinhood RPC batch");
    if (!Array.isArray(results)) throw new Error("Robinhood RPC batch returned an unexpected response.");
    return payload.map((item) => {
      const result = results.find((entry) => entry.id === item.id);
      if (result?.error) throw new Error(result.error.message || "Robinhood RPC batch error");
      return result?.result || "0x";
    });
  }

  async function snapshotRpcCall(method, params) {
    if (isMockWallet()) return state.provider.request({ method, params });
    try {
      return await publicRpcCall(method, params);
    } catch (publicError) {
      try {
        return await state.provider.request({ method, params });
      } catch (walletError) {
        const publicMessage = publicError?.message || String(publicError);
        const walletMessage = walletError?.message || String(walletError);
        throw new Error(`Snapshot log scan was blocked by both RPC paths. Public: ${publicMessage}. Wallet: ${walletMessage}. Retry in a minute; the explorer holder snapshot is the normal path.`);
      }
    }
  }

  function isReadOnlyRpcMethod(method) {
    return ["eth_blockNumber", "eth_call", "eth_getCode"].includes(method);
  }

  async function publicRpcCall(method, params) {
    const response = await fetch(CONFIG.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const payload = await readJsonResponse(response, "Robinhood RPC request");
    if (payload.error) throw new Error(payload.error.message || "Robinhood RPC error");
    return payload.result;
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    return readJsonResponse(response, `Could not load ${url}`);
  }

  async function readJsonResponse(response, label) {
    const text = await response.text();
    if (!response.ok) {
      const details = text ? `: ${text.slice(0, 160)}` : "";
      throw new Error(`${label} failed with HTTP ${response.status}${details}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label} returned invalid JSON.`);
    }
  }

  function encodeBalanceOf(address) {
    return `0x70a08231${encodeAddress(address)}`;
  }

  function encodeAddress(address) {
    const normalized = normalizeAddress(address).slice(2);
    return normalized.padStart(64, "0");
  }

  function encodeUint256(value) {
    if (value < 0n) throw new Error("Cannot encode a negative uint256.");
    return value.toString(16).padStart(64, "0");
  }

  function topicToAddress(topic) {
    const value = String(topic || "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(value)) return "";
    return `0x${value.slice(-40)}`;
  }

  function normalizeAddress(address) {
    const value = normalizeAddressSoft(address);
    if (!value) throw new Error(`Invalid address: ${address}`);
    return value;
  }

  function normalizeAddressSoft(address) {
    const value = String(address || "").trim().toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(value) ? value : "";
  }

  function isBurnAddress(address) {
    return address === CONFIG.zeroAddress || address === CONFIG.deadAddress;
  }

  function parseUnits(value, decimals) {
    const input = String(value).trim().replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(input)) throw new Error(`Invalid token amount: ${value}`);
    const [whole, fraction = ""] = input.split(".");
    const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  }

  function formatUnits(value, decimals, maxFraction = 4) {
    const negative = value < 0n;
    const raw = negative ? -value : value;
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const fraction = raw % base;
    let fractionText = fraction.toString().padStart(decimals, "0").slice(0, maxFraction);
    fractionText = fractionText.replace(/0+$/, "");
    const wholeText = whole.toLocaleString();
    return `${negative ? "-" : ""}${wholeText}${fractionText ? `.${fractionText}` : ""}`;
  }

  function formatPercent(shareBps) {
    const whole = shareBps / 10_000n;
    const fraction = (shareBps % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
    return `${whole.toString()}${fraction ? `.${fraction}` : ""}%`;
  }

  function hexToBigInt(hex) {
    if (!hex || hex === "0x") return 0n;
    return BigInt(hex);
  }

  function parseRawBigInt(value) {
    try {
      return BigInt(String(value || "0"));
    } catch {
      return 0n;
    }
  }

  function toQuantityHex(value) {
    return `0x${BigInt(value).toString(16)}`;
  }

  function toUint256Hex(value) {
    return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
  }

  function compareBigIntDesc(a, b) {
    if (a === b) return 0;
    return a > b ? -1 : 1;
  }

  function shortAddress(address) {
    return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
  }

  function setStats(updates) {
    if (updates.wallet !== undefined) $(selectors.walletStat).textContent = updates.wallet;
    if (updates.ttwo !== undefined) $(selectors.ttwoStat).textContent = updates.ttwo;
    if (updates.holders !== undefined) $(selectors.holdersStat).textContent = updates.holders;
    if (updates.block !== undefined) $(selectors.blockStat).textContent = updates.block;
  }

  function setStatus(kind, message) {
    const status = $(selectors.statusLine);
    status.className = `status-line ${kind || ""}`.trim();
    status.textContent = message;
  }

  function setBusy(isBusy) {
    $(selectors.connectButton).disabled = isBusy;
    $(selectors.snapshotButton).disabled = isBusy;
    $(selectors.downloadCsv).disabled = isBusy || !state.snapshot?.rows?.length;
  }

  function renderEmpty(message) {
    $(selectors.holderRows).innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(message)}</td></tr>`;
  }

  function renderRows(rows) {
    if (!rows.length) {
      renderEmpty("No eligible holders with the current filters.");
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.dataset.rank = String(row.rank);
      tr.innerHTML = `
        <td>${row.rank}</td>
        <td class="addr">${row.address}</td>
        <td class="num">${formatUnits(row.gsaRaw, CONFIG.gsaDecimals, 2)}</td>
        <td class="num">${formatPercent(row.shareBps)}</td>
        <td class="num">${formatUnits(row.ttwoRaw, CONFIG.ttwoDecimals, 8)}</td>
        <td>${statusPill(row)}</td>
      `;
      fragment.appendChild(tr);
    }
    const tbody = $(selectors.holderRows);
    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    updateCsvUrl();
  }

  function renderRowStatus(row) {
    const tr = document.querySelector(`tr[data-rank="${row.rank}"]`);
    if (!tr) return;
    const statusCell = tr.querySelector("td:last-child");
    statusCell.innerHTML = statusPill(row);
  }

  function statusPill(row) {
    const label = row.txHash ? `${row.status} ${shortHash(row.txHash)}` : row.status;
    const css = row.status === "sent" ? "sent" : row.status === "error" ? "error" : row.status === "prompting" ? "active" : "";
    return `<span class="pill ${css}">${escapeHtml(label)}</span>`;
  }

  function shortHash(hash) {
    return hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : "";
  }

  function updateCsvUrl() {
    clearCsvUrl();
    if (!state.snapshot?.rows?.length) return;
    const csv = snapshotToCsv(state.snapshot);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    state.csvUrl = URL.createObjectURL(blob);
    $(selectors.downloadCsv).disabled = false;
  }

  function clearCsvUrl() {
    if (state.csvUrl) URL.revokeObjectURL(state.csvUrl);
    state.csvUrl = "";
    $(selectors.downloadCsv).disabled = true;
  }

  function downloadCsv() {
    if (!state.csvUrl) updateCsvUrl();
    if (!state.csvUrl) return;
    const link = document.createElement("a");
    link.href = state.csvUrl;
    link.download = `gsa-ttwo-airdrop-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function snapshotToCsv(snapshot) {
    const header = [
      "rank",
      "address",
      "gsa_balance",
      "share_percent",
      "ttwo_allocation",
      "status",
      "tx_hash",
      "snapshot_block",
      "sender",
      "created_at",
    ];
    const lines = [header.join(",")];
    for (const row of snapshot.rows) {
      lines.push([
        row.rank,
        row.address,
        formatUnits(row.gsaRaw, CONFIG.gsaDecimals, 18),
        formatPercent(row.shareBps),
        formatUnits(row.ttwoRaw, CONFIG.ttwoDecimals, 18),
        row.status,
        row.txHash,
        snapshot.block.toString(),
        snapshot.account,
        snapshot.createdAt,
      ].map(csvCell).join(","));
    }
    return `${lines.join("\n")}\n`;
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function handleError(error) {
    console.error(error);
    const message = error?.message || "Something went wrong.";
    setStatus("bad", message);
    setBusy(false);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  window.addEventListener("DOMContentLoaded", init);
})();
