/* eslint-disable no-undef, import/no-commonjs, no-console */
// Harness that runs the static-viz bundle in a Node.js child process for the `node`
// StaticVizRenderer (see metabase.channel.render.js.node). It reads newline-delimited JSON requests
// `{ "fn": <name>, "arg": <value> }` from stdin and writes newline-delimited JSON responses
// `{ "ok": true, "result": <value> }` (or `{ "ok": false, "error": <string> }`) to stdout. `fn` is one of
// the `MetabaseStaticViz.*` bundle functions; `arg` is its argument and `result` its return value. The
// Node renderer uses the object-in/object-out functions ("renderChart" / "getCellBackgroundColors"), so
// `arg`/`result` are plain JS objects and the payload is serialized only once here (not again inside the
// bundle).
const path = require("path");
const readline = require("readline");

// Keep stdout exclusively for the line protocol — route any console output from the bundle to stderr.
for (const method of ["log", "info", "warn", "error", "debug", "trace"]) {
  console[method] = (...args) =>
    process.stderr.write(args.map((a) => String(a)).join(" ") + "\n");
}

// The bundle is a UMD build, so requiring it returns the `MetabaseStaticViz` API directly.
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
    // Serialize inside the try so a non-serializable result throws here and becomes an error response,
    // rather than an uncaught exception that kills the process.
    out = JSON.stringify({ ok: true, result: staticViz[fn](arg) });
  } catch (e) {
    out = JSON.stringify({ ok: false, error: String(e?.stack ?? e) });
  }
  process.stdout.write(out + "\n");
});
// Exit cleanly when the pool closes our stdin.
rl.on("close", () => process.exit(0));

// Announce readiness (the bundle has finished loading) so the pool can start dispatching renders.
process.stdout.write(JSON.stringify({ ready: true }) + "\n");
