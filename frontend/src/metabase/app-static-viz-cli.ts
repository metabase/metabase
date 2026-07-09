// Entry point of the self-contained Node bundle (`app-static-viz-cli.bundle.js`) run by the `:node`
// static-viz renderer (see `metabase.channel.render.js.node`). It answers newline-delimited JSON render
// requests over stdin/stdout.
//
// ESM imports are hoisted above statements but execute in import order, so the console redirect lives in
// its own dependency-free module imported first: it must run *before* the viz code loads — stdout carries
// the line protocol, so anything the bundle logs during init has to go to stderr instead.
import "metabase/static-viz/console";
import "metabase/static-viz/polyfill";

import readline from "readline";

import { getCellBackgroundColors, renderChart } from "metabase/static-viz";

const functions: Record<string, (arg: never) => unknown> = {
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
