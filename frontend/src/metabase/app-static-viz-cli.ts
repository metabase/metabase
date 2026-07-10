// Entry point of the self-contained Node bundle (`app-static-viz-cli.bundle.js`) run by the `:node`
// static-viz renderer (see `metabase.channel.render.js.node`). It answers newline-delimited JSON render
// requests over stdin/stdout.
//
// ESM imports are hoisted above statements but execute in import order, so the console redirect lives in
// its own dependency-free module imported first: it must run *before* the viz code loads — stdout carries
// the line protocol, so anything the bundle logs during init has to go to stderr instead.
import "metabase/static-viz/console";
// v60 predates the polyfill module; mock-environment plays the same role here
import "metabase/static-viz/mock-environment";

import readline from "readline";

import { getCellBackgroundColors, renderChart } from "metabase/static-viz";

// v60's static-viz index is plain JS and exports no input types; keep the payload untyped
type LineData = {
  fn: "renderChart" | "getCellBackgroundColors";
  arg: never;
};

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line: string) => {
  const lineClean = line.trim();
  if (!lineClean) {
    return;
  }
  let out;
  try {
    const lineData: LineData = JSON.parse(lineClean);
    const { fn, arg } = lineData;
    if (fn === "renderChart") {
      out = JSON.stringify({ ok: true, result: renderChart(arg) });
    } else if (fn === "getCellBackgroundColors") {
      out = JSON.stringify({ ok: true, result: getCellBackgroundColors(arg) });
    } else {
      throw new Error(`unknown function: ${fn}`);
    }
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
