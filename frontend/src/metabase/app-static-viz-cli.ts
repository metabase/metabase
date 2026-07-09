/* eslint-disable no-console */
// Entry point of the self-contained Node bundle (`app-static-viz-cli.bundle.js`) run by the `:node`
// static-viz renderer (see `metabase.channel.render.js.node`). It answers newline-delimited JSON render
// requests over stdin/stdout.
//
// Everything below uses `require` (not `import`) on purpose: ESM imports are hoisted above statements,
// and the console redirect must run *before* the viz code loads — stdout carries the line protocol, so
// anything the bundle logs during init has to go to stderr instead.

for (const method of [
  "log",
  "info",
  "warn",
  "error",
  "debug",
  "trace",
] as const) {
  console[method] = (...args: unknown[]) =>
    process.stderr.write(args.map((a) => String(a)).join(" ") + "\n");
}

import "metabase/static-viz/polyfill";

import readline from "readline";

import { getCellBackgroundColors, renderChart } from "metabase/static-viz";

const functions: Record<string, (arg: any) => unknown> = {
  renderChart,
  getCellBackgroundColors,
};

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let out;
  try {
    const { fn, arg } = JSON.parse(trimmed);
    const handler = functions[fn];
    if (!handler) {
      throw new Error(`unknown function: ${fn}`);
    }
    out = JSON.stringify({ ok: true, result: handler(arg) });
  } catch (e) {
    out = JSON.stringify({
      ok: false,
      error: String(e instanceof Error ? (e.stack ?? e) : e),
    });
  }
  process.stdout.write(out + "\n");
});

rl.on("close", () => process.exit(0));

process.stdout.write(JSON.stringify({ ready: true }) + "\n");
