# Reconstruction report — metabase#69831 (FE)

_Verbatim final report from the worktree-isolated FE reconstruction agent (a1bc3e7902aa2dec0)._

---

## reconstruction_failed

**Category: non-discriminating oracle — the fix's change to the JEST oracle spec was a structure-only async-refactor, not a behavioral assertion of the bug. The real behavioral assertion lives in a different (Cypress e2e) spec.**

### What the fix actually did

The product fix (TableInteractive.tsx, line 708-710) widened `minGridWidth` to also apply in the SDK embed case:

```
-    return isDashcardViewTable ? width : undefined;
-  }, [isDashcardViewTable, width]);
+    return isDashcardViewTable || isEmbeddingSdk ? width : undefined;
+  }, [isDashcardViewTable, isEmbeddingSdk, width]);
```

This is the behavioral change — it makes the table span the full container width in guest/SDK embeds (metabase#69831).

### Why the oracle can't discriminate it

The commit touched **two** specs:

1. **`sdk-iframe-embedding.cy.spec.ts` (Cypress e2e)** — this is where the real bug is asserted: a new test measures `totalHeaderWidth >= contentWidth`. This is the discriminating assertion, but it is **not the assigned oracle** and is not a jest spec.

2. **`SdkQuestion.unit.spec.tsx` (the assigned jest oracle)** — the only change here was in the `"should render loading state when rerunning the query"` test, converting `await ...findByText(...)` into `await waitFor(() => ...getByText(...))` (plus a `waitFor` import). These assertions verify that the column header (`TEST_COLUMN.display_name`) and a row cell (`"Test Row"`) render — they say nothing about width. It is a flakiness/async-robustness refactor bundled with the fix (the layout change likely perturbed re-render timing), semantically equivalent in what it asserts.

### Empirical proof (repro against the oracle)

- Baseline (fix present): `Tests: 19 passed, 19 total` — PASS.
- Semantic revert applied (removed `|| isEmbeddingSdk` and the dep-array entry): `Tests: 19 passed, 19 total` — still all PASS, including `should render loading state when rerunning the query`.

Reverting the genuine bug-fix does **not** fail any assertion in the oracle spec, confirming the oracle's fix-added lines (`waitFor`) are non-discriminating for this bug.

### Confidence & adversarial check

High confidence. I verified the revert targets the true fix (the exact hunk from the commit), ran it against the oracle from the worktree root with both `target` and `node_modules` symlinked (baseline correctly passes rather than false-negatives), and the specific test the fix modified still passes under the reverted product code. The bug's real regression guard is the Cypress width assertion, which is out of scope for a jest oracle. No product edits remain — TableInteractive.tsx is restored to the fixed state.

Note: the harness setup required symlinking **both** `target` and `node_modules` (the worktree had neither); with only `target` the suite errored on `csv-parse` module resolution.
