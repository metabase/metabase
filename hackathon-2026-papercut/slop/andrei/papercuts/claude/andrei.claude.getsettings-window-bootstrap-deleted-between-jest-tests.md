---
title: `getSettings(state)` falls back to `window.MetabaseBootstrap`, which the core jest setup replaces with a fresh object before every test and deletes after it, so a spec reusing one module-level `state` sees memoized selectors like `getMetadata` change identity from the second test on, which looks like an arity or memoization bug
slug: getsettings-window-bootstrap-deleted-between-jest-tests
kind: test-harness
impact: wasted-time
severity: medium
status: open # on origin/master getSettings still falls back to window.MetabaseBootstrap, and the core jest setup still recreates it before and deletes it after each test
area: frontend/src/metabase/settings/selectors.ts `getSettings`; frontend/test/jest-setup-env.js afterEach; frontend/src/metabase/metadata-store/selectors.ts `getMetadata`
merged_from: getsettings-reads-window-bootstrap-reset-per-jest-test
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/e2e06b7e-9fb4-4996-834f-51e03a49a048.jsonl
    lines: 267-495
    date: 2026-09-07
    jev: {any_papercut: 0.77, env_toolchain: 0.46, stale_state: 0.28, verify_mismatch: 0.76, misleading_code: 0.31, hidden_coupling: 0.82, stale_docs: 0.29, tool_footgun: 0.49, flaky: 0.68, agent_bug: 0.87, wasted_effort: 0.55, user_correction: 0.83}
---
## Summary
Reviewing a PR whose code comment said `getMetadata(state)` and `getMetadata(state, {})` return different objects, the reviewer wrote seven throwaway specs against master's selectors. Identity held within a test but split in later tests, and no input selector seemed to change until the seventh probe showed `getSettings` differing: when the session-properties cache is empty it returns `window.MetabaseBootstrap`, which the core jest setup rebuilds as a new object before each test and deletes after it. A spec that builds `state` once at module level therefore feeds a new settings object into every memoized selector from its second test on. In the app the state object changes on every action, so the effect the PR comment described does not exist there.

## Symptom
L296: probe `✕ stays identical across mixed call shapes` against master's selectors; L354: `T2 {}: d===a=false gm=2 deps=3 changedDeps=[]`; L376: `T2 changedDeps=[dep9:getSettings]`, followed by jest-setup-env.js afterEach showing `delete window.MetabaseBootstrap;`.

## Timeline
- L267-L296: copies master's selectors into a probe spec; identity test fails.
- L304-L338: arity2 to arity5 probes chase bare vs `undefined` vs `{}` arguments.
- L352-L354: identity splits only in the second test, with no changed dependency visible.
- L367-L376: reads reselect's weakMapMemoize and the jest setup; arity7 shows `getSettings` changed between tests.
- L438-L495: the finding is written up, then reworded: the split is a test artifact.
- Cost: seven probe specs and about 15 calls; the PR's own comment was built on the same artifact.

## Root cause
`getSettings` is not a pure function of `state`: it reads the `window.MetabaseBootstrap` global as a fallback. jest-setup-env-core.js assigns `{ ...initialBootstrap, ...createMockSettings() }` in a `beforeEach` and jest-setup-env.js deletes it in `afterEach`, so the global is a new object in every test. Selectors that take `getSettings` as an input see a new reference across tests even when `state` is identical.

## Why agents fall for it
Selectors are supposed to depend only on state, the global fallback is several files away, and the symptom (identity differs by call shape and test order) points at reselect memoization or argument arity.

## Current state
origin/master frontend/src/metabase/settings/selectors.ts: `getSettings = (state) => (selectSessionProperties(state).data ?? (typeof window !== "undefined" ? window.MetabaseBootstrap : undefined) ?? EMPTY_SETTINGS)`; frontend/test/jest-setup-env-core.js:20 `window.MetabaseBootstrap = { ...initialBootstrap, ...createMockSettings() };` in `beforeEach`; frontend/test/jest-setup-env.js:41 `delete window.MetabaseBootstrap;` in `afterEach`.

## Suggested fix
- Keep one bootstrap object per test file and reset its contents instead of replacing it, or build mock state per test (in `beforeEach`) in selector specs.
- A comment on `getSettings` that it is not a pure function of state in tests without session properties.

## Detection signal
Selector identity tests that pass in isolation but fail when run after another test in the same file; a spec that creates `createMockState(...)` at module scope and asserts `toBe` identity.

## Raw excerpts
```
L296 [RESULT] … === probe: ⏎     ✓ bare vs explicit undefined, first calls (3 ms) ⏎     ✕ stays identical across mixed call shapes (2 ms) ⏎     ✓ alternating filtered/unfiltered keeps both identities (1 ms) ⏎     ✓ provider identity across arities (2 ms) ⏎     ✕ with an INCOMPLETE entities state (no measures/metrics keys) (2 ms) ⏎   ● BASE getMetadata identity (origin/master selectors.ts) › stays identical across mixed call shapes
L317 [RESULT]     T1: bare=obj0 undef=obj0 (distinct=1) ⏎     T2: bare=obj0 undef=obj0 bare=obj0 fresh=obj1 undef=obj0 bare=obj0 (distinct=2) ⏎     T3: bare=obj0 undef=obj0 fresh=obj1 fresh=obj1 bare=obj0 undef=obj0 (distinct=2)
L354 [RESULT]     T1 a===b=true gm=1 deps=2 ⏎     T2 pre-{}: a===b=true b===c=true gm=1 deps=2 ⏎     T2 {}: d===a=false gm=2 deps=3 changedDeps=[] ⏎     T2 post: e===a=true f===a=true gm=2 deps=3
L376 [RESULT]     T1 bootstrap=object ⏎     T2 changedDeps=[dep9:getSettings] bootstrap=object ⏎ Tests:       2 passed, 2 total ⏎ --- jest-setup-env.js afterEach: ⏎ … afterEach(async () => { ⏎   // Cleanup React components FIRST to trigger any unmount effects ⏎   cleanup(); ⏎ ⏎   delete window.MetabaseBootstrap;
```
