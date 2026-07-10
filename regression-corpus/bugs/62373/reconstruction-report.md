# Reconstruction report — metabase#62373 (FE)

_Verbatim final report from the worktree-isolated FE reconstruction agent (a781b047888cc2cd3)._

---

## reconstruction_failed — category: moved-target (assertion lives in a sibling spec, not the designated oracle)

### 1. What the fix did
Fix commit `8ac41c5b` (EMB-756/757) added a single behavioral change to `translateFieldValuesInSeries` in `enterprise/frontend/src/metabase-enterprise/content_translation/utils.ts`: it captures the pre-translation rows and stores them as `data.untranslatedRows` alongside the translated `rows`, so downstream pie/cartesian/funnel/sankey code can map translated legend labels back to original keys (preserving custom colors).

Its change to the **designated oracle** `content_translation/tests/utils.unit.spec.ts` was *not* a positive assertion of that behavior. It only swapped test 1 ("should return the original series if no translations are available") from `mockTC` to `leaveUntranslated` and deleted `expect(mockTC).not.toHaveBeenCalled()`. That was scaffolding: once `untranslatedRows` gets added, a `hasTranslations`-true `tc` would make `result` no longer deep-equal `series`, so the test had to use `leaveUntranslated` to hit the pre-existing early-return guard (`if (!hasTranslations(tc)) return series`, which predates the fix).

### 2. Why the oracle can't fail
The current oracle test reads `translateFieldValuesInSeries(leaveUntranslated)(series)` → the `hasTranslations` guard short-circuits and returns the series untouched, before any `untranslatedRows` logic runs. Removing the fix's `untranslatedRows` addition therefore changes nothing on this code path. The oracle has **no assertion that inspects `untranslatedRows`** (`grep` confirms: only the `leaveUntranslated` call at line 447, no `untranslatedRows` anywhere in the file).

### 3. Empirical proof
- Oracle `content_translation/tests/utils.unit.spec.ts` — baseline: `Tests: 32 passed, 32 total`.
- Applied minimal semantic revert (dropped `const untranslatedRows = ...concat()` and the `untranslatedRows,` key in the returned `data`), leaving the curried signature and pie/cartesian handling intact — a genuine behavioral revert of the fix.
- Reran oracle: **`Tests: 32 passed, 32 total`** (no failure — reconstruction cannot succeed against this oracle).
- Cross-check: the **sibling** spec `enterprise/frontend/src/metabase-enterprise/content_translation/utils.unit.spec.ts` (added during later drift, lines 93 & 295) *does* assert `untranslatedRows` and correctly catches the same revert: `Tests: 2 failed, 92 passed` (both failures on `expect(result[0].data?.untranslatedRows).toEqual(...)`).

The `utils.ts` file has been restored to the fix-present state (`git diff` clean).

### 4. failure_shape
The fix's behavioral assertion moved to a different spec file. The designated oracle's only fix-era edit was a test-scaffolding adjustment (switch to `leaveUntranslated`) whose sole purpose was to keep an *unrelated* pre-existing `toEqual(series)` assertion green — it exercises the early-return guard, not the fix's `untranslatedRows` behavior. No product-code revert can make it fail without editing the test itself.

### 5. Confidence / adversarial reasoning
High confidence. I verified: (a) the fix commit touched only test 1 of the designated oracle and only added `untranslatedRows` in utils.ts; (b) `leaveUntranslated` forces the pre-fix early return, so the oracle's fix-touched line is behavior-insensitive to the revert; (c) direct empirical run shows 32/32 both before and after a real semantic revert; (d) the same revert IS detected by the sibling spec that actually asserts the behavior. I did not thrash on alternative reverts (removing the guard, altering the curried arity, etc.) because those would be neutralizing/arity changes rather than reintroducing the historical bug behavior, and the historical bug (missing `untranslatedRows`) is simply unobservable through this oracle.

Relevant files:
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a781b047888cc2cd3/enterprise/frontend/src/metabase-enterprise/content_translation/utils.ts` (product; fix at lines 221, 282)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a781b047888cc2cd3/enterprise/frontend/src/metabase-enterprise/content_translation/tests/utils.unit.spec.ts` (designated oracle — behavior-insensitive)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a781b047888cc2cd3/enterprise/frontend/src/metabase-enterprise/content_translation/utils.unit.spec.ts` (sibling spec that actually asserts the fix, lines 93 & 295)
