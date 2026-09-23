---
title: with-dynamic-fn-redefs proxy breaks on replacements it can't `apply` (reify IFn without applyTo) and on primitive-hinted fns
slug: dynamic-redefs-proxy-cant-wrap-some-replacements
kind: codebase-trap
impact: both
severity: medium
status: open
area: test/metabase/test/util/dynamic_redefs.clj, test/metabase/pulse/test_util.clj (wrap-function), kondo hook :metabase/prefer-with-dynamic-fn-redefs
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-ad334f260d4e69004.jsonl
    lines: 320-430
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.82, misleading_signal: 0.69, user_correction: 0.76, codebase_trap: 0.89, flailing: 0.76, env_friction: 0.89}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl
    lines: 667-685
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.59, misleading_signal: 0.82, user_correction: 0.14, codebase_trap: 0.93, flailing: 0.62, env_friction: 0.75}
---
## Summary
The kondo linter `:metabase/prefer-with-dynamic-fn-redefs` tells agents to replace `with-redefs` with `mt/with-dynamic-fn-redefs` whenever every binding is a defn-style var. The macro installs a variadic proxy `(fn [& args] ... (apply current-f args))`. Two classes of site then break at runtime even though the lint is satisfied:
1. The *replacement* is a `reify clojure.lang.IFn` with only fixed `invoke` arities (pulse `wrap-function`). `apply` needs `applyTo`, so the test throws `AbstractMethodError`.
2. The *redefined* fn has primitive type hints (BigQuery `next-page-size`, called via `IFn$LLLLL`); the plain proxy isn't an `IFn$LLLLL`, so callers throw `ClassCastException`, and because patching is permanent, every later call in the JVM fails too (found later in the same PR, recorded in the #82388 commit message).
A related trap (documented in the docstring, still hit): a replacement that captures the original via a bare symbol or `@#'var` recurses through the proxy; it needs `mt/original-fn`.

## Symptom
Batch D converted two pulse sites and got two `basic-table-test` failures; batch B converted `indexer_test` and noticed the spy captured the proxy (latent recursion). The lint was clean in both cases.

## Timeline
- Subagent D L380: "two `basic-table-test` failures land exactly on the two sites where the replacement is `pulse.test-util/wrap-function`, which returns a `reify clojure.lang.IFn` — and `with-dynamic-fn-redefs`'s proxy dispatches via `(apply current-f args)`, which needs `applyTo`."
- Subagent D L396: "Confirmed my hypothesis exactly" (AbstractMethodError).
- Subagent D L408: "Reverting both pulse sites, restoring the original `@#'` capture since `with-redefs` snapshots the root before swapping."
- Parent L670: "converting the two pulse sites caused a real `AbstractMethodError`, because `wrap-function` returns a `reify` with only fixed arities while the proxy dispatches through `apply`. That's a structural limit, not a thread issue".
- Subagent B L374: "Lines 56-58 capture bare var values at `let` time, and this same file already patches `semantic.index/upsert-index!` ... via pre-existing `mt/with-dynamic-fn-redefs` — so whenever one of those tests runs first, the spy captures the *proxy* and my converted form would make it call itself." (order-dependent: only recurses on the second test in a JVM).
- Commit aecbc3c3cbd (#82388): "`next-page-size` in the BigQuery driver takes and returns primitive longs, so compiled callers invoke it through `IFn$LLLLL`. The dynamic-redefs proxy is a plain variadic fn, so the conversion threw ClassCastException, and since patching is permanent every later BigQuery query in the JVM would too."

## Root cause
`var->proxy` (test/metabase/test/util/dynamic_redefs.clj:34-63) always wraps with a variadic `fn` and dispatches via `apply`. It checks `ifn?` and `MultiFn` but not whether the replacement implements `applyTo`, nor whether the original var carries primitive arglists. `pulse.test-util/wrap-function` (test/metabase/pulse/test_util.clj:87-108) is a `reify` with `invoke` arities 1-6 and no `applyTo`. The kondo hook only knows "is the LHS a defn", so it pushes these sites toward conversion.

## Why agents fall for it
The linter says "prefer with-dynamic-fn-redefs", the macro's docstring limitations list doesn't mention either failure mode, and the failures are runtime-only (and for primitive fns, poison the whole JVM, so the failure shows up in unrelated later tests).

## Current state
- Still exists: `dynamic_redefs.clj:61-63` `(apply current-f args)`; docstring limitations at :90-99 mention IFn-only, multimethods, `original-fn`, and thread conveyance, but not `reify` replacements or primitive-hinted vars.
- `pulse/test_util.clj:93-108` `wrap-function` still returns a `reify` with fixed arities only.
- The #82388 sites were reverted to `with-redefs` with why-comments, so master is green; the next converter hits the same thing.
- Not in memory notes (memory covers multimethods: reference_with_dynamic_fn_redefs_no_multimethods.md, and `original-fn` in reference_kondo_cache_hooks_silent_in_ci.md).

## Suggested fix
- In `var->proxy`/`patch-vars!`: throw a clear error when the original var's `:arglists` carry primitive tags (`^long`/`^double`), and wrap replacements that are not `clojure.lang.AFn` (no `applyTo`) in `(fn [& args] (.applyTo ...))`-free dispatch, e.g. dispatch by arity with `(case (count args) 0 (f) 1 (f a) ...)`.
- Or make `wrap-function` extend `AFn`/implement `applyTo`.
- Add both cases to the macro docstring and teach the kondo hook to skip vars whose arglists have primitive hints.

## Detection signal
- Test output containing `AbstractMethodError` + `applyTo` or `ClassCastException ... IFn$L` after a `with-redefs` -> `with-dynamic-fn-redefs` edit.
- `runaway recursion through proxy` AssertionError (already emitted by the proxy) signals the capture trap.
- Static: a `with-dynamic-fn-redefs` binding whose value is a call to a fn returning `reify`.

## Raw excerpts
```
(subagent D) L380 [ASSISTANT] Privately: two `basic-table-test` failures land exactly on the two sites where the replacement is `pulse.test-util/wrap-function`, which returns a `reify clojure.lang.IFn` — and `with-dynamic-fn-redefs`'s proxy dispatches via `(apply current-f args)`, which needs `applyTo`.
(subagent D) L408 [ASSISTANT] Confirmed: the only `reify`-valued *replacement functions* are the two `wrap-function` sites (the `reify javax.sql.DataSource` hits are return values of ordinary `fn`s, which have `applyTo`, and two of them sit in forms I already reverted). Reverting both pulse sites, restoring the original `@#'` capture since `with-redefs` snapshots the root before swapping.
```
