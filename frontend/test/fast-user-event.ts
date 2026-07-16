/**
 * Experiment: make userEvent instant by default.
 *
 * - `userEvent.setup(opts)` gets `delay: null` unless the caller overrides it,
 *   so no awaited setTimeout between key/pointer events.
 * - The direct APIs (`userEvent.click(...)` without setup) are rewrapped to go
 *   through a fresh delay-null instance per call, preserving their stateless
 *   semantics.
 */
import userEvent from "@testing-library/user-event";

type AnyFn = (...args: unknown[]) => unknown;

const origSetup = userEvent.setup.bind(userEvent) as AnyFn;

(userEvent as Record<string, unknown>).setup = (options: object = {}) =>
  origSetup({ delay: null, ...options });

const DIRECT_APIS = [
  "click",
  "dblClick",
  "tripleClick",
  "hover",
  "unhover",
  "tab",
  "keyboard",
  "copy",
  "cut",
  "paste",
  "pointer",
  "clear",
  "deselectOptions",
  "selectOptions",
  "type",
  "upload",
] as const;

for (const name of DIRECT_APIS) {
  const target = userEvent as unknown as Record<string, AnyFn>;
  if (typeof target[name] === "function") {
    target[name] = (...args: unknown[]) => {
      const instance = origSetup({ delay: null }) as Record<string, AnyFn>;
      return instance[name](...args);
    };
  }
}
