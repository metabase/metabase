import { setTimeout as nodeSetTimeout } from "node:timers";

const describeGlobal = (name: string) => {
  const value = (globalThis as Record<string, unknown>)[name];
  const own = Object.prototype.hasOwnProperty.call(globalThis, name);
  const text = typeof value === "function" ? String(value).slice(0, 60).replace(/\s+/g, " ") : String(value);
  return { type: typeof value, own, text };
};

it("records the timer globals", async () => {
  const names = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "Date", "performance"];
  const state: Record<string, unknown> = {};
  for (const name of names) {
    state[name] = describeGlobal(name);
  }
  const before = Date.now();
  await new Promise((resolve) => nodeSetTimeout(resolve, 20));
  state.dateAdvances = Date.now() - before;
  state.performanceNow = typeof performance?.now === "function" ? performance.now() : null;
  let microtaskRan = false;
  queueMicrotask(() => {
    microtaskRan = true;
  });
  await Promise.resolve();
  state.queueMicrotaskRuns = microtaskRan;
  // eslint-disable-next-line no-console
  process.stderr.write(`PROBE ${JSON.stringify(state)}\n`);
});
