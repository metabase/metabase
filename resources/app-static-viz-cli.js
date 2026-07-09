/* eslint-disable no-undef, import/no-commonjs, no-console */
const path = require("path");
const readline = require("readline");

for (const method of ["log", "info", "warn", "error", "debug", "trace"]) {
  console[method] = (...args) =>
    process.stderr.write(args.map((a) => String(a)).join(" ") + "\n");
}

const staticViz = require(path.join(__dirname, "lib-static-viz.bundle.js"));

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let out;
  try {
    const { fn, arg } = JSON.parse(trimmed);
    out = JSON.stringify({ ok: true, result: staticViz[fn](arg) });
  } catch (e) {
    out = JSON.stringify({ ok: false, error: String(e?.stack ?? e) });
  }
  process.stdout.write(out + "\n");
});

rl.on("close", () => process.exit(0));

process.stdout.write(JSON.stringify({ ready: true }) + "\n");
