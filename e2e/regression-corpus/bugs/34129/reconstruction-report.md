# Reconstruction report — metabase#34129 (FE)

_Verbatim final report (a608a4a5d4bd50113)._

---

Reconstruction complete and verified.

## Report

**(1) git diff** — single product file, `frontend/src/metabase/parameters/utils/date-formatting.ts` (shown above). Added a `getExpectedFilterType` mapping and a guard in `formatDateValue`: if the deserialized filter's type doesn't match the parameter's own date type, return `null`. This reintroduces bug #34129's behavior — a date parameter can no longer format a value that came from a *mismatching* parameter type. The fix's whole point ("the value can be from a mismatching parameter, so we need to test every date parameter type") is what I undid.

**(2) Oracle + baseline vs reconstructed**
- Oracle spec: `frontend/src/metabase/parameters/utils/formatting.unit.spec.ts`
- Baseline (unmodified product): `Tests: 56 passed, 56 total`
- Reconstructed: `Tests: 16 failed, 40 passed, 56 total`

**(3) failure_shape** — Clean assertion failures (`expect(received).toEqual(expected)`, `Received: null`). No crashes, type errors, or missing symbols. The 16 failures are *exactly* the fix-added mismatching-type assertions: the 5 `date/month-year` cases (`thisday`→Today, `thisweek`→This week, `past1days`→Yesterday, `past1weeks`→Previous week, and the `2023-10-02~2023-10-24` range) replicated across the 3 describe blocks (without settings / with settings / abbreviated) plus the standalone "unset settings" range test. Every matching-type assertion (e.g. `date/month-year` `2018-01`→January 2018, `date/single`, `date/range`, `date/quarter-year`, `date/relative` `past30days`, number/string/category) still passes.

**(4) Confidence: high.** Adversarial checks: (a) genuine semantic revert, not `git apply -R` — the fix commit's code (`formatDateValueForType`, moment-based per-type formatters) no longer exists; the fix drifted onto `deserializeDateParameterValue` + `getDateFilterDisplayName`, and I reintroduced the *behavior* on the drifted code. (b) Not overfit — I restricted every date param type to its own filter type generically (the faithful inverse of "test every type"), not a month-year special-case. (c) Baseline PASS → reconstructed FAIL confirms symlinks/cwd correct (ran from worktree root, `/private/...worktrees/agent-...`). (d) Failures are assertion-shaped, not compile/deletion/arity.

**(5) Ambiguity** — The fix commit also modified `initializeQB.ts` (`original_card_id` spread), but that change has no bearing on the oracle unit spec (it's the e2e-side of the same PR); the spec's added assertions are entirely about date formatting, so the reconstruction correctly targets only `date-formatting.ts`. No `reconstruction_failed` condition applies.
