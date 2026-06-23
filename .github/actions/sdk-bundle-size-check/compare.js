/* eslint-disable import/no-commonjs */
// Diffs the embedding SDK bundle sizes produced by measure-bundle-sizes.js for
// the current build and the base ref. The gate is driven by the legacy
// (monolithic) bundle's raw bytes; the chunked delivery is reported for context.
const fs = require("fs");

const [, , currentPath, basePath] = process.argv;
const threshold = Number(process.env.THRESHOLD ?? 2);

const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));

const pick = (rows, bundle, kind) => rows.find(row => row.bundle === bundle && row.kind === kind);

const setOutput = (name, value) => {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

const mb = bytes => (bytes / 1024 / 1024).toFixed(2);

const legacyCurrent = pick(current, "embedding-sdk-legacy", "total");
const legacyBase = pick(base, "embedding-sdk-legacy", "total");

if (!legacyCurrent || !legacyBase || !legacyBase.rawBytes) {
  console.error("::error::Could not find embedding-sdk-legacy size in both builds");
  process.exit(1);
}

const diff = legacyCurrent.rawBytes - legacyBase.rawBytes;
const percent = Math.trunc((diff * 100) / legacyBase.rawBytes);

const status = percent > threshold ? "increased" : percent < -threshold ? "decreased" : "stable";

console.log("=== Embedding SDK legacy (monolithic) bundle ===");
console.log(`Current:  ${legacyCurrent.rawBytes} bytes raw / ${mb(legacyCurrent.gzipBytes)}MB gzip`);
console.log(`Base ref: ${legacyBase.rawBytes} bytes raw / ${mb(legacyBase.gzipBytes)}MB gzip`);
console.log(`Difference: ${diff} bytes (${percent}%), threshold ${threshold}%`);
console.log(`Status: ${status}`);

const chunkedCurrent = pick(current, "embedding-sdk-chunked", "total");
const chunkedBase = pick(base, "embedding-sdk-chunked", "total");
if (chunkedCurrent && chunkedBase) {
  const chunkedDiff = chunkedCurrent.rawBytes - chunkedBase.rawBytes;
  console.log("");
  console.log("=== Embedding SDK chunked (informational) ===");
  console.log(`Current:  ${chunkedCurrent.rawBytes} bytes raw / ${mb(chunkedCurrent.gzipBytes)}MB gzip`);
  console.log(`Base ref: ${chunkedBase.rawBytes} bytes raw / ${mb(chunkedBase.gzipBytes)}MB gzip`);
  console.log(`Difference: ${chunkedDiff} bytes`);
}

setOutput("status", status);
setOutput("size_change_percent", percent);
