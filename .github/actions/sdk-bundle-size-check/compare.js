/* eslint-disable import/no-commonjs */
// Diffs the bundle sizes produced by measure-bundle-sizes.js for the current
// build and the base ref. Every (bundle, kind) is compared strictly against the
// same (bundle, kind) — never one bundle type against another — using gzipped
// (served) bytes. The gate is driven by the chunked SDK's reachable total, which
// is what the SDK actually delivers.
const fs = require("fs");

const [, , currentPath, basePath] = process.argv;
const threshold = Number(process.env.THRESHOLD ?? 2);

const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));

const pick = (rows, bundle, kind) => rows.find(row => row.bundle === bundle && row.kind === kind);
const keyOf = row => `${row.bundle}/${row.kind}`;

const setOutput = (name, value) => {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

const mb = bytes => (bytes / 1024 / 1024).toFixed(2);
const percentOf = (currentBytes, baseBytes) =>
  baseBytes ? Math.trunc(((currentBytes - baseBytes) * 100) / baseBytes) : 0;

// Report every (bundle, kind) same-vs-same.
console.log("=== Bundle sizes (gzipped, current vs base) ===");
const keys = [...new Set([...current, ...base].map(keyOf))].sort();
for (const key of keys) {
  const [bundle, kind] = key.split("/");
  const currentRow = pick(current, bundle, kind);
  const baseRow = pick(base, bundle, kind);
  if (!currentRow || !baseRow) {
    console.log(`${key}: present only in ${currentRow ? "current" : "base"} build`);
    continue;
  }
  const diff = currentRow.gzipBytes - baseRow.gzipBytes;
  const percent = percentOf(currentRow.gzipBytes, baseRow.gzipBytes);
  console.log(`${key}: ${mb(currentRow.gzipBytes)}MB vs ${mb(baseRow.gzipBytes)}MB (${percent}%, ${diff} bytes)`);
}

// Gate on the chunked SDK's reachable total (gzipped) — what the SDK ships.
const gateCurrent = pick(current, "embedding-sdk-chunked", "total");
const gateBase = pick(base, "embedding-sdk-chunked", "total");
if (!gateCurrent || !gateBase || !gateBase.gzipBytes) {
  console.error("::error::Could not find embedding-sdk-chunked total (gzip) in both builds");
  process.exit(1);
}

const percent = percentOf(gateCurrent.gzipBytes, gateBase.gzipBytes);
const status = percent > threshold ? "increased" : percent < -threshold ? "decreased" : "stable";

console.log("");
console.log(`Gate: embedding-sdk-chunked total ${percent}% (threshold ${threshold}%) → ${status}`);

setOutput("status", status);
setOutput("size_change_percent", percent);
