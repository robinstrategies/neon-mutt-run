(() => {
  "use strict";

  const CONFIG = Object.freeze({
    chainIdHex: "0x1237",
    chainName: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    gsaContract: "0xb4396384569cf9b00058edb11d6bf12a626e1e18",
    ttwoContract: "0x5e81213613b6b86eab4c6c50d718d34359459786",
    artifactUrl: "contracts/artifacts/GsaTtwoDailyClaimVault.json",
    gsaDecimals: 18,
    ttwoDecimals: 18,
    gsaFromBlock: 49_987_000n,
    snapshotConfirmations: 12n,
    logChunkSize: 10_000n,
    rpcBatchSize: 60,
    transferTopic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    zeroAddress: "0x0000000000000000000000000000000000000000",
    deadAddress: "0x000000000000000000000000000000000000dead",
    selectors: {
      approve: "0x095ea7b3",
      allowance: "0xdd62ed3e",
      balanceOf: "0x70a08231",
      createRound: "0x4a6f7b54",
      setAllocations: "0x30c82017",
      fundRound: "0x4b361a24",
      openRound: "0xbde22ae0",
      claim: "0x379607f5",
      claimable: "0xa0c7f71c",
      roundStatus: "0xe35154a5",
      ttwo: "0x4824103c",
      owner: "0x8da5cb5b",
      latestOpenRoundId: "0xf45abdc7",
    },
  });

  const state = {
    page: "",
    provider: null,
    account: "",
    announcedProviders: [],
    snapshot: null,
    csvUrl: "",
    vaultArtifact: null,
    busy: false,
    stopRequested: false,
    claimReady: false,
  };

  const $ = (selector) => document.querySelector(selector);

  function init() {
    state.page = document.body.dataset.claimPage || "";
    listenForWalletProviders();
    state.provider = getWalletProvider();

    if (state.page === "admin") initAdmin();
    if (state.page === "holder") initHolder();

    if (state.provider) {
      const hasClaimTarget = state.page !== "holder" || hasClaimConfig();
      if (hasClaimTarget) {
        setStatus("work", isMockWallet() ? "Local mock wallet ready for testing." : "Wallet detected. Connect when ready.");
      }
    }
  }

  function initAdmin() {
    $("#roundId").value = getInitialRoundId();
    $("#vaultAddress").value = getInitialVaultAddress();
    renderEmpty("Connect wallet, then press Snapshot.");
    updateClaimLink();

    $("#connectButton").addEventListener("click", () => connectWallet().catch(handleError));
    $("#deployVaultButton").addEventListener("click", () => deployVault().catch(handleError));
    $("#saveVaultButton").addEventListener("click", saveVaultAddress);
    $("#snapshotButton").addEventListener("click", () => runSnapshot().catch(handleError));
    $("#publishRoundButton").addEventListener("click", () => publishClaimRound().catch(handleError));
    $("#downloadCsv").addEventListener("click", downloadCsv);
    $("#downloadManifest").addEventListener("click", () => downloadManifest().catch(handleError));
    $("#copyClaimLink").addEventListener("click", copyClaimLink);
    $("#realSendConfirm").addEventListener("change", updatePublishAvailability);
    $("#vaultAddress").addEventListener("input", updateClaimLink);
    $("#roundId").addEventListener("input", updateClaimLink);
    $("#blockedWallets").value = localStorage.getItem("gsaBlockedWallets") || "";
    $("#blockedWallets").addEventListener("change", saveBlockedWallets);
    $("#ttwoBudget").addEventListener("change", () => {
      if (state.snapshot) setStatus("work", "TTWO amount changed. Press Snapshot again to rebuild allocations.");
    });
    $("#stopButton").addEventListener("click", () => {
      state.stopRequested = true;
      setStatus("work", "Stopping after the current wallet prompt finishes.");
    });
  }

  function initHolder() {
    $("#roundId").value = getInitialRoundId();
    $("#vaultAddress").value = getInitialVaultAddress();

    $("#connectButton").addEventListener("click", async () => {
      try {
        await connectWallet();
        if (hasClaimConfig()) await checkClaim();
      } catch (error) {
        handleError(error);
      }
    });
    $("#checkClaimButton").addEventListener("click", () => checkClaim().catch(handleError));
    $("#claimButton").addEventListener("click", () => claimTtwo().catch(handleError));
    $("#vaultAddress").addEventListener("input", resetHolderClaimTarget);
    $("#roundId").addEventListener("input", resetHolderClaimTarget);

    if (!hasClaimConfig()) {
      setStatus("bad", "No live claim round is set yet. Use the daily claim link when it is posted.");
    }
    updateHolderAvailability();

    if (isMockWallet() && new URLSearchParams(window.location.search).get("selftest") === "doubleclaim") {
      setTimeout(runDoubleClaimSelfTest, 0);
    }
  }

  async function runDoubleClaimSelfTest() {
    const results = [];
    const assert = (name, ok, details = "") => {
      results.push({ name, ok: Boolean(ok), details });
    };

    try {
      await connectWallet();
      await checkClaim();
      const vault = normalizeAddress($("#vaultAddress").value);
      const roundId = parsePositiveBigInt($("#roundId").value, "Round ID");
      const before = await readClaimable(vault, roundId, state.account);
      assert("mock holder starts with a claimable allocation", before > 0n, formatUnits(before, CONFIG.ttwoDecimals, 8));

      await claimTtwo();
      const afterFirst = await readClaimable(vault, roundId, state.account);
      assert("first claim drains the holder allocation", afterFirst === 0n, formatUnits(afterFirst, CONFIG.ttwoDecimals, 8));

      let secondRejected = false;
      let secondMessage = "";
      try {
        await claimTtwo();
      } catch (error) {
        secondMessage = error?.message || String(error);
        secondRejected = /nothing to claim/i.test(secondMessage);
      }
      assert("second claim in the same round is rejected", secondRejected, secondMessage);
      assert("claim button remains disabled after claiming", $("#claimButton").disabled, String($("#claimButton").disabled));
    } catch (error) {
      results.push({ name: "double-claim self-test exception", ok: false, details: error?.stack || error?.message || String(error) });
    } finally {
      const passed = results.filter((result) => result.ok).length;
      const payload = { passed, total: results.length, rate: results.length ? passed / results.length : 0, results };
      window.GSA_CLAIM_SELFTEST_RESULTS = payload;
      document.documentElement.dataset.gsaClaimSelftest = JSON.stringify(payload);
    }
  }

  function listenForWalletProviders() {
    window.addEventListener("eip6963:announceProvider", (event) => {
      if (event.detail?.provider) state.announcedProviders.push(event.detail);
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  function getWalletProvider() {
    if (isMockWallet()) return createMockProvider();

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
    return isLocalHost() && params.get("mockWallet") === "1";
  }

  function isLocalHost() {
    return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  }

  function createMockProvider() {
    const params = new URLSearchParams(window.location.search);
    const adminAccount = "0x1111111111111111111111111111111111111111";
    const claimAccount = "0x0000000000000000000000000000000000000002";
    const mockAccount = state.page === "holder" ? claimAccount : adminAccount;
    const mockVault = "0x2222222222222222222222222222222222222222";
    const mockBlock = 50_061_900n;
    const mockBlockHash = "0x" + "b".repeat(64);
    const requestedMockHolders = Number(params.get("mockHolders") || "140");
    const mockHolderCount = Number.isSafeInteger(requestedMockHolders)
      ? Math.min(Math.max(requestedMockHolders, 1), 1_200)
      : 140;
    const mockTtwoWalletBalance = parseUnits("10", CONFIG.ttwoDecimals);
    const mockHolders = new Map(Array.from({ length: mockHolderCount }, (_, index) => {
      const number = (index + 2).toString(16).padStart(40, "0");
      const balance = parseUnits(String(2_500_000 - index * 1_000), CONFIG.gsaDecimals);
      return [`0x${number}`, balance];
    }));
    const mockRounds = new Map();
    const receipts = new Map();
    let mockLatestOpenRoundId = 0n;

    if (state.page === "holder") {
      const roundId = BigInt(normalizeRoundIdSoft(params.get("round")) || normalizeRoundIdSoft(window.GSA_CLAIMS_CONFIG?.latestRoundId) || getTodayRoundId());
      mockLatestOpenRoundId = roundId;
      const holders = Array.from(mockHolders.entries()).map(([address, gsaRaw]) => ({ address, gsaRaw }));
      const totalGsaRaw = holders.reduce((sum, holder) => sum + holder.gsaRaw, 0n);
      const rows = allocateTtwo(holders, totalGsaRaw, mockTtwoWalletBalance);
      const allocations = new Map(rows.map((row) => [row.address, row.ttwoRaw]));
      mockRounds.set(roundId.toString(), {
        snapshotHash: "0x" + "a".repeat(64),
        snapshotBlock: mockBlock,
        snapshotBlockHash: mockBlockHash,
        allocationCount: rows.length,
        totalAllocated: rows.reduce((sum, row) => sum + row.ttwoRaw, 0n),
        funded: mockTtwoWalletBalance,
        claimed: 0n,
        open: true,
        exists: true,
        allocations,
        claimedBy: new Map(),
      });
    }

    function getRound(roundId) {
      const key = roundId.toString();
      if (!mockRounds.has(key)) {
        mockRounds.set(key, {
          snapshotHash: "0x" + "0".repeat(64),
          snapshotBlock: 0n,
          snapshotBlockHash: "0x" + "0".repeat(64),
          allocationCount: 0,
          totalAllocated: 0n,
          funded: 0n,
          claimed: 0n,
          open: false,
          exists: false,
          allocations: new Map(),
          claimedBy: new Map(),
        });
      }
      return mockRounds.get(key);
    }

    function fakeHash(seed = "") {
      const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).padStart(16, "0");
      return `0x${(seed || "3").repeat(48).slice(0, 48)}${random}`;
    }

    return {
      isRabby: true,
      async request({ method, params: requestParams }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [mockAccount];
        if (method === "eth_chainId") return CONFIG.chainIdHex;
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        if (method === "eth_blockNumber") return toQuantityHex(mockBlock);
        if (method === "eth_getBlockByNumber") {
          const requestedBlock = hexToBigInt(requestParams?.[0] || toQuantityHex(mockBlock));
          return { hash: mockBlockHash, number: toQuantityHex(requestedBlock) };
        }
        if (method === "eth_getTransactionReceipt") return receipts.get(normalizeHash(requestParams?.[0])) || null;
        if (method === "eth_getLogs") {
          const range = requestParams?.[0] || {};
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
        if (method === "eth_getCode") {
          const address = normalizeAddressSoft(requestParams?.[0]);
          return address === mockVault ? "0x60016000" : "0x";
        }
        if (method === "eth_call") {
          const call = requestParams?.[0] || {};
          const to = normalizeAddressSoft(call.to);
          const data = String(call.data || "").toLowerCase();
          if (to === CONFIG.ttwoContract && data.startsWith(CONFIG.selectors.balanceOf)) {
            const owner = `0x${data.slice(-40)}`;
            if (owner === adminAccount) return toUint256Hex(mockTtwoWalletBalance);
            if (owner === mockVault) {
              const held = Array.from(mockRounds.values()).reduce((sum, round) => sum + round.funded - round.claimed, 0n);
              return toUint256Hex(held);
            }
            return toUint256Hex(0n);
          }
          if (to === CONFIG.ttwoContract && data.startsWith(CONFIG.selectors.allowance)) {
            return toUint256Hex(mockTtwoWalletBalance);
          }
          if (to === CONFIG.gsaContract && data.startsWith(CONFIG.selectors.balanceOf)) {
            const owner = `0x${data.slice(-40)}`;
            return toUint256Hex(mockHolders.get(owner) || 0n);
          }
          if (to === mockVault && data.startsWith(CONFIG.selectors.ttwo)) {
            return encodeAddressReturn(CONFIG.ttwoContract);
          }
          if (to === mockVault && data.startsWith(CONFIG.selectors.owner)) {
            return encodeAddressReturn(adminAccount);
          }
          if (to === mockVault && data.startsWith(CONFIG.selectors.latestOpenRoundId)) {
            return toUint256Hex(mockLatestOpenRoundId);
          }
          if (to === mockVault && data.startsWith(CONFIG.selectors.roundStatus)) {
            const roundId = readWord(data, 0);
            const round = getRound(roundId);
            return encodeStaticReturn([
              round.snapshotHash,
              round.snapshotBlock,
              round.snapshotBlockHash,
              BigInt(round.allocationCount),
              round.totalAllocated,
              round.funded,
              round.claimed,
              round.open ? 1n : 0n,
              round.exists ? 1n : 0n,
            ]);
          }
          if (to === mockVault && data.startsWith(CONFIG.selectors.claimable)) {
            const roundId = readWord(data, 0);
            const account = readAddressWord(data, 1);
            const round = getRound(roundId);
            const allocation = round.allocations.get(account) || 0n;
            const alreadyClaimed = round.claimedBy.get(account) || 0n;
            return toUint256Hex(round.open && allocation > alreadyClaimed ? allocation - alreadyClaimed : 0n);
          }
          return "0x" + "0".repeat(64);
        }
        if (method === "eth_sendTransaction") {
          const tx = requestParams?.[0] || {};
          const to = normalizeAddressSoft(tx.to);
          const data = String(tx.data || "").toLowerCase();
          const hash = fakeHash("4");

          if (!to && data.startsWith("0x60")) {
            receipts.set(hash, {
              transactionHash: hash,
              status: "0x1",
              contractAddress: mockVault,
              blockNumber: toQuantityHex(mockBlock),
            });
            return hash;
          }

          if (to === mockVault && data.startsWith(CONFIG.selectors.createRound)) {
            const roundId = readWord(data, 0);
            const round = getRound(roundId);
            round.snapshotHash = `0x${wordAt(data, 1)}`;
            round.snapshotBlock = readWord(data, 2);
            round.snapshotBlockHash = `0x${wordAt(data, 3)}`;
            round.exists = true;
          }

          if (to === mockVault && data.startsWith(CONFIG.selectors.setAllocations)) {
            const roundId = readWord(data, 0);
            const accounts = decodeAddressArray(data, 1);
            const amounts = decodeUintArray(data, 2);
            const round = getRound(roundId);
            round.exists = true;
            for (let index = 0; index < accounts.length; index += 1) {
              round.allocations.set(accounts[index], amounts[index]);
            }
            round.allocationCount = round.allocations.size;
            round.totalAllocated = Array.from(round.allocations.values()).reduce((sum, amount) => sum + amount, 0n);
          }

          if (to === mockVault && data.startsWith(CONFIG.selectors.fundRound)) {
            const roundId = readWord(data, 0);
            const amount = readWord(data, 1);
            const open = readWord(data, 2) === 1n;
            const round = getRound(roundId);
            round.funded += amount;
            if (open) {
              round.open = true;
              mockLatestOpenRoundId = roundId;
            }
          }

          if (to === mockVault && data.startsWith(CONFIG.selectors.openRound)) {
            const roundId = readWord(data, 0);
            getRound(roundId).open = true;
            mockLatestOpenRoundId = roundId;
          }

          if (to === mockVault && data.startsWith(CONFIG.selectors.claim)) {
            const roundId = readWord(data, 0);
            const from = normalizeAddressSoft(tx.from) || mockAccount;
            const round = getRound(roundId);
            if (!round.open) throw new Error("ClaimsNotOpen");
            const allocation = round.allocations.get(from) || 0n;
            const previous = round.claimedBy.get(from) || 0n;
            if (allocation <= previous) throw new Error("NothingToClaim");
            const due = allocation - previous;
            round.claimedBy.set(from, allocation);
            round.claimed += due;
          }

          receipts.set(hash, { transactionHash: hash, status: "0x1", blockNumber: toQuantityHex(mockBlock) });
          return hash;
        }
        throw new Error(`Mock wallet does not support ${method}`);
      },
    };
  }

  async function connectWallet() {
    state.provider = getWalletProvider();
    if (!state.provider) throw new Error("No wallet found. Install Rabby, then refresh this page.");

    setBusy(true);
    try {
      const accounts = await state.provider.request({ method: "eth_requestAccounts" });
      state.account = normalizeAddress(accounts?.[0]);
      await ensureRobinhoodChain();
      $("#connectButton").textContent = "Wallet Connected";
      const walletStat = $("#walletStat");
      if (walletStat) walletStat.textContent = shortAddress(state.account);
      setStatus("good", `Connected ${shortAddress(state.account)} on Robinhood Chain.`);
      return state.account;
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

  async function deployVault() {
    if (!state.account) await connectWallet();

    setBusy(true);
    try {
      setStatus("work", "Preparing claim vault deployment...");
      const artifact = await fetchJson(CONFIG.artifactUrl);
      if (!artifact.bytecode || artifact.bytecode === "0x") throw new Error("Claim vault artifact is missing bytecode.");

      const data = `${artifact.bytecode}${encodeAddress(CONFIG.ttwoContract)}`;
      setStatus("work", "Approve the claim vault deployment in Rabby.");
      const txHash = await state.provider.request({
        method: "eth_sendTransaction",
        params: [{ from: state.account, data }],
      });
      setStatus("work", `Deployment sent ${shortHash(txHash)}. Waiting for contract address...`);
      const receipt = await waitForReceipt(txHash);
      if (!receipt?.contractAddress) throw new Error("Deployment receipt did not include a contract address.");

      $("#vaultAddress").value = normalizeAddress(receipt.contractAddress);
      saveVaultAddress({ silent: true });
      updateClaimLink();
      setStatus("good", `Claim vault deployed: ${shortAddress(receipt.contractAddress)}.`);
    } finally {
      setBusy(false);
    }
  }

  async function runSnapshot() {
    if (!state.account) await connectWallet();

    const minRaw = parseUnits($("#minBalance").value || "100000", CONFIG.gsaDecimals);
    if (minRaw <= 0n) throw new Error("Minimum GSA must be above zero.");

    setBusy(true);
    clearCsvUrl();
    renderEmpty("Building snapshot...");
    setAdminStats({ wallet: shortAddress(state.account), ttwo: "…", holders: "…", block: "…" });

    try {
      await ensureRobinhoodChain();
      const walletTtwoBalanceRaw = await tokenBalance(CONFIG.ttwoContract, state.account);
      const ttwoBudgetRaw = parseTtwoBudget(walletTtwoBalanceRaw);
      setAdminStats({ ttwo: `${formatUnits(walletTtwoBalanceRaw, CONFIG.ttwoDecimals, 6)} wallet · ${formatUnits(ttwoBudgetRaw, CONFIG.ttwoDecimals, 6)} round` });

      const latestBlock = hexToBigInt(await chainCall("eth_blockNumber", []));
      const snapshotBlock = latestBlock > CONFIG.snapshotConfirmations ? latestBlock - CONFIG.snapshotConfirmations : latestBlock;
      const snapshotBlockData = await chainCall("eth_getBlockByNumber", [toQuantityHex(snapshotBlock), false]);
      const snapshotBlockHash = normalizeBytes32(snapshotBlockData?.hash);
      setAdminStats({ block: snapshotBlock.toString() });
      const balances = await buildHolderBalances(snapshotBlock);
      const blockedWallets = parseAddressList($("#blockedWallets").value);

      let holders = Array.from(balances.entries())
        .map(([address, balanceRaw]) => ({ address, balanceRaw }))
        .filter((holder) => holder.balanceRaw >= minRaw)
        .filter((holder) => !isBurnAddress(holder.address));

      if (blockedWallets.size) {
        holders = holders.filter((holder) => !blockedWallets.has(holder.address));
      }

      if ($("#excludeSender").checked) {
        holders = holders.filter((holder) => holder.address !== state.account);
      }

      if ($("#excludeContracts").checked && holders.length) {
        setStatus("work", "Checking for contract wallets...");
        holders = await excludeContractWallets(holders, snapshotBlock);
      }

      holders.sort((a, b) => compareBigIntDesc(a.balanceRaw, b.balanceRaw));
      const totalGsaRaw = holders.reduce((sum, holder) => sum + holder.balanceRaw, 0n);
      const rows = allocateTtwo(holders, totalGsaRaw, ttwoBudgetRaw);

      state.snapshot = {
        account: state.account,
        block: snapshotBlock,
        blockHash: snapshotBlockHash,
        minRaw,
        walletTtwoBalanceRaw,
        ttwoBalanceRaw: ttwoBudgetRaw,
        totalGsaRaw,
        blockedWallets: Array.from(blockedWallets).sort(),
        rows,
        createdAt: new Date().toISOString(),
      };

      renderRows(rows);
      setAdminStats({
        holders: rows.length.toLocaleString(),
        block: snapshotBlock.toString(),
        ttwo: `${formatUnits(walletTtwoBalanceRaw, CONFIG.ttwoDecimals, 6)} wallet · ${formatUnits(ttwoBudgetRaw, CONFIG.ttwoDecimals, 6)} round`,
      });
      updatePublishAvailability();
      setStatus(
        rows.length ? "good" : "bad",
        rows.length
          ? `Snapshot ready: ${rows.length.toLocaleString()} eligible holders.`
          : "No eligible holders found with the current filters."
      );
    } finally {
      setBusy(false);
    }
  }

  async function publishClaimRound() {
    if (!state.account) await connectWallet();
    if (!state.snapshot?.rows?.length) throw new Error("Run Snapshot first.");
    if (!$("#realSendConfirm").checked) throw new Error("Check the real-round confirmation box first.");

    const vault = normalizeAddress($("#vaultAddress").value);
    const roundId = parsePositiveBigInt($("#roundId").value, "Round ID");
    const chunkSize = Math.min(parsePositiveInt($("#chunkSize").value || "70", "Chunk size"), 120);
    const totalAllocation = state.snapshot.rows.reduce((sum, row) => sum + row.ttwoRaw, 0n);
    if (totalAllocation <= 0n) throw new Error("Connected wallet has 0 TTWO to fund.");

    state.stopRequested = false;
    setBusy(true, { publishing: true });

    try {
      await ensureRobinhoodChain();
      await assertClaimVault(vault, { requireOwner: true });

      const snapshotHash = await snapshotDigest(state.snapshot, roundId);
      let round = await readRoundStatus(vault, roundId);

      if (!round.exists) {
        setStatus("work", "Approve createRound in Rabby.");
        await sendAndWait(vault, encodeCreateRound(roundId, snapshotHash, state.snapshot.block, state.snapshot.blockHash, `GSA TTWO ${roundId.toString()}`));
      }

      const rows = state.snapshot.rows.filter((row) => row.ttwoRaw > 0n);
      for (let index = 0; index < rows.length; index += chunkSize) {
        if (state.stopRequested) throw new Error("Stopped before funding. You can rerun this button to continue.");
        const chunk = rows.slice(index, index + chunkSize);
        setStatus("work", `Approve allocation chunk ${Math.floor(index / chunkSize) + 1}/${Math.ceil(rows.length / chunkSize)} in Rabby.`);
        await sendAndWait(vault, encodeSetAllocations(roundId, chunk.map((row) => row.address), chunk.map((row) => row.ttwoRaw)));
        for (const row of chunk) {
          row.status = "loaded";
          renderRowStatus(row);
        }
      }

      round = await readRoundStatus(vault, roundId);
      const remainingFunding = totalAllocation > round.funded ? totalAllocation - round.funded : 0n;

      if (remainingFunding > 0n) {
        setStatus("work", `Approve ${formatUnits(remainingFunding, CONFIG.ttwoDecimals, 8)} TTWO for the vault.`);
        await sendAndWait(CONFIG.ttwoContract, encodeApprove(vault, remainingFunding));
        setStatus("work", "Approve fundRound in Rabby. This moves TTWO into the claim vault and opens claims.");
        await sendAndWait(vault, encodeFundRound(roundId, remainingFunding, true));
      } else if (!round.claimsOpen) {
        setStatus("work", "Approve openRound in Rabby.");
        await sendAndWait(vault, encodeOpenRound(roundId));
      }

      for (const row of state.snapshot.rows) {
        if (row.status !== "loaded") continue;
        row.status = "open";
        renderRowStatus(row);
      }

      updateCsvUrl();
      saveVaultAddress({ silent: true });
      updateClaimLink();
      setStatus("good", "Claim round is open. Share the holder claim link.");
    } finally {
      setBusy(false);
      updatePublishAvailability();
    }
  }

  async function checkClaim() {
    if (!state.account) await connectWallet();

    const vault = normalizeAddress($("#vaultAddress").value);

    setBusy(true);
    try {
      await ensureRobinhoodChain();
      await assertClaimVault(vault);
      await resolveLatestRoundIfNeeded(vault);
      const roundId = parsePositiveBigInt($("#roundId").value, "Round ID");
      const round = await readRoundStatus(vault, roundId);
      const amount = await readClaimable(vault, roundId, state.account);
      state.claimReady = round.exists && round.claimsOpen && amount > 0n;

      $("#walletStat").textContent = shortAddress(state.account);
      $("#roundStat").textContent = !round.exists ? "Missing" : round.claimsOpen ? "Open" : "Closed";
      $("#claimAmountStat").textContent = `${formatUnits(amount, CONFIG.ttwoDecimals, 8)} TTWO`;
      $("#fundedStat").textContent = round.exists ? `${formatUnits(round.funded, CONFIG.ttwoDecimals, 6)} TTWO` : "—";
      $("#claimButton").disabled = !state.claimReady;

      setStatus(
        amount > 0n ? "good" : "bad",
        amount > 0n
          ? `You can claim ${formatUnits(amount, CONFIG.ttwoDecimals, 8)} TTWO.`
          : round.exists ? "No claim available for this wallet in this round." : "This claim round does not exist."
      );
    } finally {
      setBusy(false);
    }
  }

  async function claimTtwo() {
    if (state.busy) return;
    if (!state.account) await connectWallet();
    const vault = normalizeAddress($("#vaultAddress").value);

    setBusy(true);
    try {
      await ensureRobinhoodChain();
      await assertClaimVault(vault);
      await resolveLatestRoundIfNeeded(vault);
      const roundId = parsePositiveBigInt($("#roundId").value, "Round ID");
      const amount = await readClaimable(vault, roundId, state.account);
      if (amount <= 0n) throw new Error("Nothing to claim for this wallet in this round.");
      setStatus("work", "Approve the claim transaction in Rabby.");
      await sendAndWait(vault, encodeClaim(roundId));
      await checkClaim();
      setStatus("good", "Claim complete.");
    } finally {
      setBusy(false);
    }
  }

  async function buildHolderBalances(currentBlock) {
    const balances = new Map();
    let from = CONFIG.gsaFromBlock;
    const to = currentBlock;
    let logCount = 0;

    while (from <= to) {
      const chunkTo = from + CONFIG.logChunkSize - 1n > to ? to : from + CONFIG.logChunkSize - 1n;
      setStatus("work", `Reading GSA logs: blocks ${from.toString()}–${chunkTo.toString()}...`);
      const logs = await chainCall("eth_getLogs", [{
        fromBlock: toQuantityHex(from),
        toBlock: toQuantityHex(chunkTo),
        address: CONFIG.gsaContract,
        topics: [CONFIG.transferTopic],
      }]);
      for (const log of logs || []) applyTransferLog(balances, log);
      logCount += logs?.length || 0;
      from = chunkTo + 1n;
    }

    setStatus("work", `Processed ${logCount.toLocaleString()} GSA transfers. Verifying current balances...`);
    return verifyPositiveBalances(balances, currentBlock);
  }

  async function verifyPositiveBalances(balances, snapshotBlock) {
    const candidates = Array.from(balances.entries())
      .filter(([, balance]) => balance > 0n)
      .map(([address]) => address);
    const verified = new Map();

    for (let index = 0; index < candidates.length; index += CONFIG.rpcBatchSize) {
      const batch = candidates.slice(index, index + CONFIG.rpcBatchSize);
      setStatus("work", `Verifying balances ${index + 1}–${Math.min(index + batch.length, candidates.length)} of ${candidates.length}...`);
      const results = await chainBatch(batch.map((address) => ({
        method: "eth_call",
        params: [{ to: CONFIG.gsaContract, data: encodeBalanceOf(address) }, toQuantityHex(snapshotBlock)],
      })));
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

  async function excludeContractWallets(holders, snapshotBlock) {
    const keepers = [];
    for (let index = 0; index < holders.length; index += CONFIG.rpcBatchSize) {
      const batch = holders.slice(index, index + CONFIG.rpcBatchSize);
      const results = await chainBatch(batch.map((holder) => ({
        method: "eth_getCode",
        params: [holder.address, toQuantityHex(snapshotBlock)],
      })));
      for (let offset = 0; offset < batch.length; offset += 1) {
        if (!results[offset] || results[offset] === "0x") keepers.push(batch[offset]);
      }
    }
    return keepers;
  }

  function allocateTtwo(holders, totalGsaRaw, ttwoBalanceRaw) {
    if (!holders.length || totalGsaRaw <= 0n) return [];
    let allocatedRaw = 0n;
    const rows = holders.map((holder, index) => {
      const gsaRaw = holder.gsaRaw ?? holder.balanceRaw;
      const ttwoRaw = (gsaRaw * ttwoBalanceRaw) / totalGsaRaw;
      allocatedRaw += ttwoRaw;
      return {
        rank: index + 1,
        address: holder.address,
        gsaRaw,
        shareBps: (gsaRaw * 1_000_000n) / totalGsaRaw,
        ttwoRaw,
        status: "ready",
      };
    });
    const remainder = ttwoBalanceRaw - allocatedRaw;
    if (remainder > 0n && rows[0]) rows[0].ttwoRaw += remainder;
    return rows;
  }

  async function tokenBalance(contract, owner) {
    return hexToBigInt(await chainCall("eth_call", [{ to: contract, data: encodeBalanceOf(owner) }, "latest"]));
  }

  async function readRoundStatus(vault, roundId) {
    const data = await chainCall("eth_call", [{ to: vault, data: encodeRoundStatus(roundId) }, "latest"]);
    const chunks = staticChunks(data, 9);
    return {
      snapshotHash: `0x${chunks[0]}`,
      snapshotBlock: BigInt(`0x${chunks[1]}`),
      snapshotBlockHash: `0x${chunks[2]}`,
      allocationCount: Number(BigInt(`0x${chunks[3]}`)),
      totalAllocated: BigInt(`0x${chunks[4]}`),
      funded: BigInt(`0x${chunks[5]}`),
      claimed: BigInt(`0x${chunks[6]}`),
      claimsOpen: BigInt(`0x${chunks[7]}`) === 1n,
      exists: BigInt(`0x${chunks[8]}`) === 1n,
    };
  }

  async function readClaimable(vault, roundId, account) {
    const data = await chainCall("eth_call", [{ to: vault, data: encodeClaimable(roundId, account) }, "latest"]);
    return hexToBigInt(data);
  }

  async function resolveLatestRoundIfNeeded(vault) {
    if ($("#roundId").value.trim()) return;
    setStatus("work", "Finding the latest open claim round...");
    const data = await chainCall("eth_call", [{ to: vault, data: CONFIG.selectors.latestOpenRoundId }, "latest"]);
    const latest = hexToBigInt(data);
    if (latest <= 0n) throw new Error("No open claim round found for this vault yet.");
    $("#roundId").value = latest.toString();
    updateHolderAvailability();
  }

  async function assertClaimVault(vault, options = {}) {
    const code = await assertContract(vault);
    if (!isMockWallet()) {
      const artifact = await getClaimVaultArtifact();
      if (!deployedCodeMatchesArtifact(code, artifact)) {
        throw new Error("This vault code does not match the official GSA claim vault build. Do not approve this transaction.");
      }
    }

    const data = await chainCall("eth_call", [{ to: vault, data: CONFIG.selectors.ttwo }, "latest"]);
    const ttwo = readReturnAddress(data, 0);
    if (ttwo !== CONFIG.ttwoContract) {
      throw new Error("This vault does not point at the expected TTWO token. Do not use this claim link.");
    }

    if (options.requireOwner) {
      const ownerData = await chainCall("eth_call", [{ to: vault, data: CONFIG.selectors.owner }, "latest"]);
      const owner = readReturnAddress(ownerData, 0);
      if (owner !== state.account) {
        throw new Error("Connected wallet is not the owner of this claim vault. Do not fund it from this page.");
      }
    }
  }

  async function assertContract(address) {
    const code = await chainCall("eth_getCode", [address, "latest"]);
    if (!code || code === "0x") throw new Error("No contract found at that vault address.");
    return String(code).toLowerCase();
  }

  async function getClaimVaultArtifact() {
    if (!state.vaultArtifact) state.vaultArtifact = await fetchJson(CONFIG.artifactUrl);
    return state.vaultArtifact;
  }

  function deployedCodeMatchesArtifact(code, artifact) {
    const actual = stripHexPrefix(code);
    const expected = stripHexPrefix(artifact?.deployedBytecode);
    if (!actual || !expected || actual.length !== expected.length) return false;

    const ranges = immutableByteRanges(artifact?.immutableReferences)
      .map((range) => ({ start: range.start * 2, end: (range.start + range.length) * 2 }))
      .sort((a, b) => a.start - b.start);

    let cursor = 0;
    for (const range of ranges) {
      if (actual.slice(cursor, range.start) !== expected.slice(cursor, range.start)) return false;
      cursor = Math.max(cursor, range.end);
    }
    return actual.slice(cursor) === expected.slice(cursor);
  }

  function immutableByteRanges(references) {
    const ranges = [];
    for (const entry of Object.values(references || {})) {
      if (Array.isArray(entry)) {
        ranges.push(...entry);
      } else {
        for (const nested of Object.values(entry || {})) {
          if (Array.isArray(nested)) ranges.push(...nested);
        }
      }
    }
    return ranges.filter((range) => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.length));
  }

  async function chainCall(method, params) {
    if (!state.provider) throw new Error("Connect Rabby first.");
    return state.provider.request({ method, params });
  }

  async function chainBatch(calls) {
    const results = [];
    for (const call of calls) {
      results.push(await chainCall(call.method, call.params));
    }
    return results;
  }

  async function sendAndWait(to, data) {
    const txHash = await state.provider.request({
      method: "eth_sendTransaction",
      params: [{ from: state.account, to, value: "0x0", data }],
    });
    const receipt = await waitForReceipt(txHash);
    if (receipt?.status && receipt.status !== "0x1") throw new Error(`Transaction failed: ${shortHash(txHash)}`);
    return receipt;
  }

  async function waitForReceipt(txHash) {
    const normalized = normalizeHash(txHash);
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const receipt = await state.provider.request({ method: "eth_getTransactionReceipt", params: [normalized] });
      if (receipt) return receipt;
      await delay(2_000);
    }
    throw new Error(`Timed out waiting for transaction ${shortHash(txHash)}.`);
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    return response.json();
  }

  function encodeCreateRound(roundId, snapshotHash, snapshotBlock, snapshotBlockHash, label) {
    return `${CONFIG.selectors.createRound}${encodeUint256(roundId)}${normalizeBytes32(snapshotHash).slice(2)}${encodeUint256(snapshotBlock)}${normalizeBytes32(snapshotBlockHash).slice(2)}${encodeUint256(160n)}${encodeStringTail(label)}`;
  }

  function encodeSetAllocations(roundId, accounts, amounts) {
    const accountTail = encodeAddressArray(accounts);
    const amountTail = encodeUintArray(amounts);
    const accountOffset = 96n;
    const amountOffset = accountOffset + BigInt(accountTail.length / 2);
    return `${CONFIG.selectors.setAllocations}${encodeUint256(roundId)}${encodeUint256(accountOffset)}${encodeUint256(amountOffset)}${accountTail}${amountTail}`;
  }

  function encodeFundRound(roundId, amount, openAfterFunding) {
    return `${CONFIG.selectors.fundRound}${encodeUint256(roundId)}${encodeUint256(amount)}${encodeUint256(openAfterFunding ? 1n : 0n)}`;
  }

  function encodeOpenRound(roundId) {
    return `${CONFIG.selectors.openRound}${encodeUint256(roundId)}`;
  }

  function encodeClaim(roundId) {
    return `${CONFIG.selectors.claim}${encodeUint256(roundId)}`;
  }

  function encodeClaimable(roundId, account) {
    return `${CONFIG.selectors.claimable}${encodeUint256(roundId)}${encodeAddress(account)}`;
  }

  function encodeRoundStatus(roundId) {
    return `${CONFIG.selectors.roundStatus}${encodeUint256(roundId)}`;
  }

  function encodeApprove(spender, amount) {
    return `${CONFIG.selectors.approve}${encodeAddress(spender)}${encodeUint256(amount)}`;
  }

  function encodeBalanceOf(address) {
    return `${CONFIG.selectors.balanceOf}${encodeAddress(address)}`;
  }

  function encodeAddressArray(accounts) {
    return `${encodeUint256(BigInt(accounts.length))}${accounts.map(encodeAddress).join("")}`;
  }

  function encodeUintArray(amounts) {
    return `${encodeUint256(BigInt(amounts.length))}${amounts.map(encodeUint256).join("")}`;
  }

  function encodeStringTail(value) {
    const bytes = new TextEncoder().encode(String(value));
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const paddedLength = Math.ceil(hex.length / 64) * 64;
    return `${encodeUint256(BigInt(bytes.length))}${hex.padEnd(paddedLength, "0")}`;
  }

  function decodeAddressArray(data, headWordIndex) {
    const clean = data.slice(10);
    const offset = Number(BigInt(`0x${clean.slice(headWordIndex * 64, headWordIndex * 64 + 64)}`));
    const base = offset * 2;
    const length = Number(BigInt(`0x${clean.slice(base, base + 64)}`));
    return Array.from({ length }, (_, index) => `0x${clean.slice(base + 64 + index * 64 + 24, base + 64 + (index + 1) * 64)}`);
  }

  function decodeUintArray(data, headWordIndex) {
    const clean = data.slice(10);
    const offset = Number(BigInt(`0x${clean.slice(headWordIndex * 64, headWordIndex * 64 + 64)}`));
    const base = offset * 2;
    const length = Number(BigInt(`0x${clean.slice(base, base + 64)}`));
    return Array.from({ length }, (_, index) => BigInt(`0x${clean.slice(base + 64 + index * 64, base + 64 + (index + 1) * 64)}`));
  }

  function readWord(data, index) {
    return BigInt(`0x${wordAt(data, index)}`);
  }

  function readAddressWord(data, index) {
    return `0x${wordAt(data, index).slice(-40)}`;
  }

  function wordAt(data, index) {
    const clean = String(data || "").replace(/^0x/i, "").slice(8);
    return clean.slice(index * 64, index * 64 + 64).padStart(64, "0");
  }

  function encodeStaticReturn(values) {
    return `0x${values.map((value) => {
      if (typeof value === "string" && value.startsWith("0x") && value.length === 66) return value.slice(2);
      return encodeUint256(value);
    }).join("")}`;
  }

  function encodeAddressReturn(address) {
    return `0x${normalizeAddress(address).slice(2).padStart(64, "0")}`;
  }

  function staticChunks(data, count) {
    const clean = String(data || "").replace(/^0x/i, "");
    return Array.from({ length: count }, (_, index) => clean.slice(index * 64, index * 64 + 64).padStart(64, "0"));
  }

  function readReturnAddress(data, index) {
    const clean = String(data || "").replace(/^0x/i, "");
    const word = clean.slice(index * 64, index * 64 + 64).padStart(64, "0");
    return normalizeAddress(`0x${word.slice(-40)}`);
  }

  async function snapshotDigest(snapshot, roundId) {
    const stable = snapshot.rows.map((row) => [
      row.rank,
      row.address,
      row.gsaRaw.toString(),
      row.ttwoRaw.toString(),
    ].join(":")).join("|");
    const payload = `${roundId.toString()}|${snapshot.account}|${snapshot.block.toString()}|${snapshot.blockHash}|${stable}`;
    return sha256Hex(payload);
  }

  async function sha256Hex(payload) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    return `0x${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  function normalizeBytes32(value) {
    const text = String(value || "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(text)) throw new Error("Invalid snapshot hash.");
    return text;
  }

  function getInitialRoundId() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeRoundIdSoft(params.get("round"));
    if (fromUrl) return fromUrl;
    const fromConfig = normalizeRoundIdSoft(window.GSA_CLAIMS_CONFIG?.latestRoundId);
    if (fromConfig) return fromConfig;
    if (state.page === "holder") return "";
    return getTodayRoundId();
  }

  function normalizeRoundIdSoft(value) {
    const text = String(value || "").trim();
    if (!/^\d+$/.test(text)) return "";
    try {
      return BigInt(text) > 0n ? text : "";
    } catch {
      return "";
    }
  }

  function getTodayRoundId() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  }

  function getInitialVaultAddress() {
    const params = new URLSearchParams(window.location.search);
    const fromConfig = normalizeAddressSoft(window.GSA_CLAIMS_CONFIG?.claimVaultAddress);
    if (fromConfig) return fromConfig;
    if (state.page === "holder" && !isLocalHost()) return "";
    const fromUrl = normalizeAddressSoft(params.get("contract"));
    if (fromUrl) return fromUrl;
    const fromStorage = normalizeAddressSoft(localStorage.getItem("gsaClaimVault"));
    return fromStorage || (isMockWallet() ? "0x2222222222222222222222222222222222222222" : "");
  }

  function hasClaimConfig() {
    const hasVault = Boolean(normalizeAddressSoft($("#vaultAddress")?.value));
    if (state.page === "holder") return hasVault;
    return Boolean(hasVault && normalizeRoundIdSoft($("#roundId")?.value));
  }

  function updateHolderAvailability() {
    if (state.page !== "holder") return;
    const hasVault = Boolean(normalizeAddressSoft($("#vaultAddress")?.value));
    const checkButton = $("#checkClaimButton");
    if (checkButton) checkButton.disabled = state.busy || !hasVault;
    const claimButton = $("#claimButton");
    if (claimButton) claimButton.disabled = state.busy || !state.claimReady;
  }

  function resetHolderClaimTarget() {
    if (state.page !== "holder") return;
    state.claimReady = false;
    const roundStat = $("#roundStat");
    const amountStat = $("#claimAmountStat");
    const fundedStat = $("#fundedStat");
    if (roundStat) roundStat.textContent = "—";
    if (amountStat) amountStat.textContent = "—";
    if (fundedStat) fundedStat.textContent = "—";
    updateHolderAvailability();
  }

  function saveBlockedWallets() {
    const blocked = Array.from(parseAddressList($("#blockedWallets").value)).sort();
    $("#blockedWallets").value = blocked.join("\n");
    localStorage.setItem("gsaBlockedWallets", $("#blockedWallets").value);
    if (blocked.length) setStatus("good", `Saved ${blocked.length.toLocaleString()} blocked wallet${blocked.length === 1 ? "" : "s"}.`);
  }

  function saveVaultAddress(options = {}) {
    const address = normalizeAddress($("#vaultAddress").value);
    localStorage.setItem("gsaClaimVault", address);
    updateClaimLink();
    if (!options.silent) setStatus("good", `Saved claim vault ${shortAddress(address)} on this browser.`);
  }

  function updateClaimLink() {
    const box = $("#claimLinkBox");
    if (!box) return;
    const address = normalizeAddressSoft($("#vaultAddress").value);
    const roundId = normalizeRoundIdSoft($("#roundId").value);
    if (!address || !roundId) {
      box.classList.add("hidden");
      return;
    }
    const link = `${window.location.origin}/claim.html?contract=${address}&round=${encodeURIComponent(roundId)}`;
    $("#claimLink").value = link;
    box.classList.remove("hidden");
  }

  async function copyClaimLink() {
    const value = $("#claimLink").value;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setStatus("good", "Claim link copied.");
  }

  function setAdminStats(updates) {
    if (updates.wallet !== undefined) $("#walletStat").textContent = updates.wallet;
    if (updates.ttwo !== undefined) $("#ttwoStat").textContent = updates.ttwo;
    if (updates.holders !== undefined) $("#holdersStat").textContent = updates.holders;
    if (updates.block !== undefined) $("#blockStat").textContent = updates.block;
  }

  function setStatus(kind, message) {
    const status = $("#statusLine");
    if (!status) return;
    status.className = `status-line ${kind || ""}`.trim();
    status.textContent = message;
  }

  function setBusy(isBusy, options = {}) {
    state.busy = isBusy;
    const ids = [
      "connectButton",
      "deployVaultButton",
      "snapshotButton",
      "saveVaultButton",
      "checkClaimButton",
    ];
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) element.disabled = isBusy;
    }
    const stopButton = $("#stopButton");
    if (stopButton) stopButton.disabled = !options.publishing;
    const claimButton = $("#claimButton");
    if (claimButton) claimButton.disabled = isBusy || !state.claimReady;
    updateHolderAvailability();
    updatePublishAvailability();
  }

  function updatePublishAvailability() {
    const button = $("#publishRoundButton");
    if (!button) return;
    button.disabled = !(
      state.snapshot?.rows?.length &&
      normalizeAddressSoft($("#vaultAddress").value) &&
      normalizeRoundIdSoft($("#roundId").value) &&
      $("#realSendConfirm").checked &&
      !state.busy
    );
    const download = $("#downloadCsv");
    if (download) download.disabled = !state.snapshot?.rows?.length || state.busy;
    const manifest = $("#downloadManifest");
    if (manifest) manifest.disabled = !state.snapshot?.rows?.length || state.busy;
  }

  function renderEmpty(message) {
    const tbody = $("#holderRows");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(message)}</td></tr>`;
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
    const tbody = $("#holderRows");
    tbody.innerHTML = "";
    tbody.appendChild(fragment);
    updateCsvUrl();
  }

  function renderRowStatus(row) {
    const tr = document.querySelector(`tr[data-rank="${row.rank}"]`);
    if (!tr) return;
    tr.querySelector("td:last-child").innerHTML = statusPill(row);
  }

  function statusPill(row) {
    const css = row.status === "open" ? "sent" : row.status === "loaded" ? "active" : row.status === "error" ? "error" : "";
    return `<span class="pill ${css}">${escapeHtml(row.status)}</span>`;
  }

  function updateCsvUrl() {
    clearCsvUrl();
    if (!state.snapshot?.rows?.length) return;
    const csv = snapshotToCsv(state.snapshot);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    state.csvUrl = URL.createObjectURL(blob);
    const button = $("#downloadCsv");
    if (button) button.disabled = false;
    const manifestButton = $("#downloadManifest");
    if (manifestButton) manifestButton.disabled = false;
  }

  function clearCsvUrl() {
    if (state.csvUrl) URL.revokeObjectURL(state.csvUrl);
    state.csvUrl = "";
    const button = $("#downloadCsv");
    if (button) button.disabled = true;
    const manifestButton = $("#downloadManifest");
    if (manifestButton) manifestButton.disabled = true;
  }

  function downloadCsv() {
    if (!state.csvUrl) updateCsvUrl();
    if (!state.csvUrl) return;
    const link = document.createElement("a");
    link.href = state.csvUrl;
    link.download = `gsa-ttwo-claim-round-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadManifest() {
    if (!state.snapshot?.rows?.length) return;
    const roundId = parsePositiveBigInt($("#roundId").value, "Round ID");
    const csv = snapshotToCsv(state.snapshot);
    const manifest = {
      name: "GSA TTWO Daily Claim Snapshot",
      chain: CONFIG.chainName,
      chainId: CONFIG.chainIdHex,
      gsaContract: CONFIG.gsaContract,
      ttwoContract: CONFIG.ttwoContract,
      claimVault: normalizeAddressSoft($("#vaultAddress").value) || null,
      roundId: roundId.toString(),
      snapshotBlock: state.snapshot.block.toString(),
      snapshotBlockHash: state.snapshot.blockHash,
      snapshotHash: await snapshotDigest(state.snapshot, roundId),
      csvSha256: await sha256Hex(csv),
      ownerWallet: state.snapshot.account,
      minGsa: formatUnits(state.snapshot.minRaw, CONFIG.gsaDecimals, 18),
      holderCount: state.snapshot.rows.length,
      totalGsaRaw: state.snapshot.totalGsaRaw.toString(),
      totalTtwoRaw: state.snapshot.ttwoBalanceRaw.toString(),
      blockedWallets: state.snapshot.blockedWallets || [],
      excludeContracts: $("#excludeContracts").checked,
      excludeOwnerWallet: $("#excludeSender").checked,
      createdAt: state.snapshot.createdAt,
    };
    const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gsa-ttwo-claim-round-${roundId.toString()}-manifest.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function snapshotToCsv(snapshot) {
    const lines = [[
      "rank",
      "address",
      "gsa_balance",
      "share_percent",
      "ttwo_claim",
      "status",
      "snapshot_block",
      "snapshot_block_hash",
      "owner",
      "created_at",
    ].join(",")];

    for (const row of snapshot.rows) {
      lines.push([
        row.rank,
        row.address,
        formatUnits(row.gsaRaw, CONFIG.gsaDecimals, 18),
        formatPercent(row.shareBps),
        formatUnits(row.ttwoRaw, CONFIG.ttwoDecimals, 18),
        row.status,
        snapshot.block.toString(),
        snapshot.blockHash,
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

  function parseAddressList(value) {
    const addresses = String(value || "")
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const parsed = new Set();
    for (const address of addresses) {
      parsed.add(normalizeAddress(address));
    }
    return parsed;
  }

  function parseUnits(value, decimals) {
    const input = String(value).trim().replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(input)) throw new Error(`Invalid token amount: ${value}`);
    const [whole, fraction = ""] = input.split(".");
    const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  }

  function parseTtwoBudget(walletTtwoBalanceRaw) {
    const input = $("#ttwoBudget")?.value.trim();
    if (!input) return walletTtwoBalanceRaw;
    const budgetRaw = parseUnits(input, CONFIG.ttwoDecimals);
    if (budgetRaw <= 0n) throw new Error("TTWO to fund must be above zero.");
    if (budgetRaw > walletTtwoBalanceRaw) throw new Error("TTWO to fund is higher than the connected wallet balance.");
    return budgetRaw;
  }

  function formatUnits(value, decimals, maxFraction = 4) {
    const negative = value < 0n;
    const raw = negative ? -value : value;
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const fraction = raw % base;
    let fractionText = fraction.toString().padStart(decimals, "0").slice(0, maxFraction);
    fractionText = fractionText.replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole.toLocaleString()}${fractionText ? `.${fractionText}` : ""}`;
  }

  function formatPercent(shareBps) {
    const whole = shareBps / 10_000n;
    const fraction = (shareBps % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
    return `${whole.toString()}${fraction ? `.${fraction}` : ""}%`;
  }

  function encodeAddress(address) {
    return normalizeAddress(address).slice(2).padStart(64, "0");
  }

  function encodeUint256(value) {
    const raw = BigInt(value);
    if (raw < 0n) throw new Error("Cannot encode a negative uint256.");
    return raw.toString(16).padStart(64, "0");
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

  function normalizeHash(hash) {
    const value = String(hash || "").trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error(`Invalid transaction hash: ${hash}`);
    return value;
  }

  function isBurnAddress(address) {
    return address === CONFIG.zeroAddress || address === CONFIG.deadAddress;
  }

  function hexToBigInt(hex) {
    if (!hex || hex === "0x") return 0n;
    return BigInt(hex);
  }

  function stripHexPrefix(value) {
    return String(value || "").replace(/^0x/i, "").toLowerCase();
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

  function parsePositiveInt(value, label) {
    const parsed = Number(String(value).trim());
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive whole number.`);
    return parsed;
  }

  function parsePositiveBigInt(value, label) {
    const text = String(value || "").trim();
    if (!/^\d+$/.test(text) || BigInt(text) <= 0n) throw new Error(`${label} must be a positive whole number.`);
    return BigInt(text);
  }

  function shortAddress(address) {
    return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
  }

  function shortHash(hash) {
    return hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : "";
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    setStatus("bad", error?.message || "Something went wrong.");
    setBusy(false);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
