# Reconstruction report — metabase#52333

_Verbatim final report from the worktree-isolated reconstruction agent (ac2e18b28a4c39f06)._

---

I have a definitive, empirically-verified conclusion. Restored the worktree to clean state. Here is my report.

## Reconstruction outcome: `reconstruction_failed` (backend oracle is non-discriminating)

### (1) What the fix actually did

`git show a43bdf804d` touches `src/metabase/pivot/core.cljc` — the row-subtotal logic (`add-subtotals` / `add-subtotal` / `process-children`). The behavioral change:

- **Pre-fix:** a subtotal row was gated by a *global* `has-multiple-children` flag at the root level (`should-show-root-total = (or has-multiple-children (> (count children) 1))`) and `(or (> children 1) collapsed)` at the child level. Net effect: a group with a single item (or a single-dimension leaf) **never** got its own subtotal.
- **Post-fix:** introduced `pivot.condense_duplicate_totals` and `subtotal-visible?`. When the setting is **false** (the fix-commit default), `(not condense?)` short-circuits to `true`, so **single items now get subtotals**. When **true**, it degrades to `(or (> children 1) collapsed)` — i.e. exactly the old behavior.

The genuinely new capability (subtotals for single items) is only reached with `condense=false`.

### (2) Why the named backend oracles do NOT discriminate

Every backend test the fix touched was patched by **adding `:pivot.condense_duplicate_totals true`** to its viz settings — specifically to *suppress* the new default and preserve the pre-existing expected output. None of these tests changed a single `is` expected-value form; they only added the setting line.

Consequence: for `condense=true`, post-fix behavior is **byte-identical** to pre-fix behavior on all the tested data. The only place old-vs-new-condensed diverge is a non-collapsed root with ≤1 child *while another root has >1* (global `has-multiple-children` vs per-item) — and none of the test datasets (fully-populated cross-joins; products category×year with all 4 years present; single-dimension MEASURE/CATEGORY leaves) contain that shape.

The real discriminating assertion lives in the **frontend** JS test `frontend/test/metabase/lib/data_grid.unit.spec.js` ("does not condense duplicate totals", which sets `condenseDuplicateTotals: false` and asserts `"Totals for x"`/`"Totals for y"` appear). That is not a backend deftest.

### (3) Empirical proof

I applied a **full semantic revert** of the subtotal section to the exact pre-fix parent code (restored `should-create-subtotal?`, the local `should-show-fn`, and the global `has-multiple-children`/`should-show-root-total`; removed `subtotal-visible?`/`subtotal-permitted?` and the `settings` threading), then ran all 9 fix-touched deftests from the worktree root:

- Batch 1 — `simple-pivot-export-test`, `simple-pivot-with-sum-and-average-export-test`, `pivot-export-test`: **38 assertions, 0 failures**.
- Batch 2 — `pivot-table-in-xlsx-test`, `format-rows-value-affects-xlsx-exports`, `pivot-non-numeric-values-in-aggregations`, `pivot-exports-handle-nil-in-breakout-column`, `pivot-exports-handle-aggregations-with-the-same-base-name`, `pivot-exports-aggregations-work`: **28 assertions, 0 failures**.

A complete revert of the fix leaves every backend oracle **green**. Since a full revert cannot fail them, no *minimal* subset can either.

### (4) failure_shape

`none` — there is no product change that both (a) semantically reverts fix #56988 (reintroducing "single items don't get subtotals," bug #52333) and (b) fails a fix-added backend assertion. The original bug and the `condense=true` assertions are mutually consistent, so the bug is invisible to these tests. (The only way to make these `condense=true` tests fail is to *break condense suppression* so single-item subtotals reappear — but that is a forward-injected defect in the condense feature, the opposite of bug #52333, not a semantic revert.)

### (5) Confidence & adversarial reasoning

**Confidence: high** that the named backend oracles are non-discriminating.
- Adversarial check 1 — "wrong cwd false-negative": ran from the worktree root (`pwd` confirmed `.claude/worktrees/agent-ac2e18b28a4c39f06`); the runner reported it was loading the reverted namespace. The revert was a real, loaded product change, not a no-op.
- Adversarial check 2 — "maybe only some tests discriminate": I ran **all 9** touched deftests, not just the two named ones. All pass.
- Adversarial check 3 — "maybe the fix changed expected values, not just settings": the test diff adds only `:pivot.condense_duplicate_totals true` lines; no `is` expected-data was altered (confirmed by reading the hunks and by the clean revert passing exact-equality assertions like `simple-pivot-export-test`).
- Adversarial check 4 — "maybe a mixed-child dataset exists": reasoned through each dataset (fully-populated 4×4×4×4 cross joins; category×year with all years; single-dimension leaves) — none produce a single-child-among-multi root, the only shape where old vs condensed diverge.

### Ambiguity / recommendation

The task premise ("pick the cleanest whose fix-added assertions discriminate") does not hold for this fix's **backend** tests — the fix-added content is a behavior-neutralizing *setting*, not a discriminating assertion. If the corpus needs a discriminating oracle for #52333, it must use the **frontend** unit test `frontend/test/metabase/lib/data_grid.unit.spec.js` (the `condenseDuplicateTotals: false` case), and the minimal revert is: in `src/metabase/pivot/core.cljc`, drop the `(not condense?)` term from `subtotal-visible?` (so single items stop showing subtotals even when condensing is off) — that fails the JS assertion but no backend deftest.

Worktree restored to clean master (`git status` clean; product file unchanged).
