// Some third-party test packages hard-code a global `jest` object. Rstest
// exposes `rstest`, not `jest`, so those packages break unless we bridge the
// specific methods they touch:
//
//  - `jest-canvas-mock` (lib/mock/*, lib/classes/*) calls `jest.fn` /
//    `jest.isMockFunction` on import and whenever a mocked canvas method runs.
//  - `@testing-library/dom` + `@testing-library/react` drive fake timers
//    inside `waitFor` via `jest.advanceTimersByTime`, gated on
//    `typeof jest !== "undefined"`. Once `globalThis.jest` exists, that gate
//    opens, so the facade MUST also forward `advanceTimersByTime` to rstest —
//    otherwise `waitFor` throws "jest.advanceTimersByTime is not a function"
//    on every fake-timer test.
//
// This is a third-party compatibility shim, NOT a migration shim: all of
// Metabase's own test code was rewritten to call `rstest.*` directly. Keep
// this limited to the methods third-party packages actually reach for, and do
// not widen it into a blanket `globalThis.jest = rstest`.
//
// Must be imported BEFORE `jest-canvas-mock` (ESM side-effect imports run in
// source order, and jest-canvas-mock patches the canvas on import).
globalThis.jest ??= {
  fn: (...args) => rstest.fn(...args),
  isMockFunction: (value) => rstest.isMockFunction(value),
  advanceTimersByTime: (ms) => rstest.advanceTimersByTime(ms),
};
