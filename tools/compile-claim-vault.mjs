#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const CONTRACT_PATH = resolve("contracts/GsaTtwoDailyClaimVault.sol");
const ARTIFACT_PATH = resolve("contracts/artifacts/GsaTtwoDailyClaimVault.json");

let solc;
try {
  solc = (await import("solc")).default;
} catch {
  console.error("Missing Solidity compiler. Run: npm install --save-dev solc");
  process.exit(1);
}

const source = await readFile(CONTRACT_PATH, "utf8");
const input = {
  language: "Solidity",
  sources: {
    "GsaTtwoDailyClaimVault.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors || [];
const fatal = errors.filter((entry) => entry.severity === "error");

for (const entry of errors) {
  const stream = entry.severity === "error" ? process.stderr : process.stdout;
  stream.write(`${entry.formattedMessage}\n`);
}

if (fatal.length) process.exit(1);

const compiled = output.contracts["GsaTtwoDailyClaimVault.sol"].GsaTtwoDailyClaimVault;
const artifact = {
  contractName: "GsaTtwoDailyClaimVault",
  sourceName: "contracts/GsaTtwoDailyClaimVault.sol",
  abi: compiled.abi,
  bytecode: `0x${compiled.evm.bytecode.object}`,
  deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
  compiler: solc.version(),
  optimizer: { enabled: true, runs: 200 },
  generatedAt: new Date().toISOString(),
};

await mkdir(dirname(ARTIFACT_PATH), { recursive: true });
await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Wrote ${ARTIFACT_PATH}`);
