/**
 * Fast-test regime: fake timers + instant userEvent, applied to every spec
 * file EXCEPT those grandfathered in real-timers-grandfather.js (they fail
 * under the regime and keep stock behaviour until fixed).
 *
 * What the regime changes:
 * - jest fake timers are installed for the file, so no real time passes in
 *   tests: no waitFor polling delays, no debounce waits. Time-dependent
 *   behaviour must be advanced explicitly (waitFor does this automatically).
 * - `userEvent.setup(opts)` gets `delay: null` unless the caller overrides
 *   it, so there is no awaited setTimeout between key/pointer events. The
 *   direct APIs (`userEvent.click(...)` without setup) are rewrapped through
 *   a fresh delay-null instance per call, preserving their stateless
 *   semantics.
 *
 * Fixing playbook (to remove a spec from the grandfather list):
 * 1. Wait for the LOADED state before interacting — `findBy*` plus a
 *    `waitFor` on a data-bearing attribute (`toBeChecked`, endpoint-provided
 *    text), not just element presence; components often render interactable
 *    shells before their queries resolve.
 * 2. If the component refetches after an update, re-register the mock with
 *    the post-update value before triggering the update
 *    (e.g. `setupPropertiesEndpoints(createMockSettings({ ... }))`).
 * 3. Wrap post-interaction assertions in `waitFor` — it advances the fake
 *    clock; synchronous asserts after a click race timer-gated effects.
 * 4. Advancing the clock can wake background timers (polling, refetches);
 *    mock the endpoints they hit.
 * 5. Tests whose subject IS real timing can call `jest.useRealTimers()`.
 */
import { configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// eslint-disable-next-line import/no-commonjs
const grandfathered: string[] = require("./real-timers-grandfather.js");

const testPath = expect.getState().testPath ?? "";
const enrolled =
  !process.env.DISABLE_FAST_TESTS &&
  (Boolean(process.env.FAST_TESTS_FORCE) ||
    !grandfathered.some((path) => testPath.endsWith(path)));

if (enrolled) {
  jest.useFakeTimers();

  // waitFor's budget elapses in fake time, which helpers like findRequests
  // advance by hundreds of ms per poll — the default 1s budget allows only
  // ~2 polls. Fake milliseconds are free, so give waitFor plenty.
  configure({ asyncUtilTimeout: 10_000 });

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
}
