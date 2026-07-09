// Imported FIRST by the node CLI entry (`app-static-viz-cli.ts`): stdout carries the render line
// protocol, so console output must be routed to stderr before any static-viz module gets a chance to
// log during initialization. This module has no imports of its own, so its body is guaranteed to run
// before every other module in the bundle (ESM imports are hoisted, but execute in import order).
/* eslint-disable no-console */

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
