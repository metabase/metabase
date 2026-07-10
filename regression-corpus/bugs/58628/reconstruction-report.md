# Reconstruction report — metabase#58628 (FE)

_Verbatim final report from the FE reconstruction agent (ae152ca99d6cb4c85)._

---

Reverted and tree is clean. Here is my report.

## reconstruction_failed

**Category:** `no_unit_oracle__real_oracle_cypress`

### 1. What the fix did (`git show 509225c8`)
The behavioral change lives in `initializeQB.ts` (`handleQBInit`): when `queryBuilderMode === "notebook"`, load databases and, if the user has no data access, `dispatch(replace("/unauthorized"))` and bail. In current code this has drifted to an equivalent form (still present, not the bug):
```ts
if (uiControls.queryBuilderMode === "notebook") {
  if (!canUserCreateQueries(getState())) {
    dispatch(replace(Urls.unauthorized()));
    return;
  }
}
```

The **real behavioral assertions** the fix added are in two Cypress e2e specs, not the unit spec:
- `e2e/test/scenarios/question-reproductions/reproductions.cy.spec.ts` (new `issue 58628` block): `cy.url().should("include", "/unauthorized")` + "Sorry, you don't have permission to see that."
- `e2e/test/scenarios/question/notebook-link-to-data-source.cy.spec.ts`: replaced the entity-picker expectations with the same `/unauthorized` + permission-text assertions.

The fix's change to the **unit spec** (`initializeQB.unit.spec.ts`) was purely **mechanical mock plumbing** — it added `const databases = hasDataPermissions ? [...] : []` and changed the dispatch mock to return `{ unwrap: () => ({ data: databases }) }` so pre-existing tests wouldn't break under the new `loadDatabases` code path. It added **zero `expect(...)` assertions** about the redirect.

### 2. Oracle spec: baseline vs reconstructed
- Baseline: `Tests: 135 passed, 135 total`
- After removing the entire notebook/`canUserCreateQueries`/`replace(unauthorized)` block (semantic bug reintroduction): `Tests: 135 passed, 135 total` — **still green**.

The current unit spec contains no test that combines notebook mode with `hasDataPermissions: false` and asserts a redirect / `replace(Urls.unauthorized())` / null result. The two notebook-mode tests (lines 292, 328) both run with the default `hasDataPermissions: true`, so the redirect never fires and its removal is invisible to them.

### 3. failure_shape
None achievable at the unit level. The bug is not observable through the Jest oracle (`initializeQB.unit.spec.ts`).

### 4. Confidence + adversarial reasoning
High confidence this is a genuine honest-negative. Adversarial checks performed:
- Empirically deleted the whole behavioral guard, not just `git apply -R` — full suite still passed.
- Grepped the entire spec for `replace`, `unauthorized`, `canUserCreateQueries`, `not.toHaveBeenCalled` in a notebook/perms context — no assertion targets this behavior.
- Confirmed correct cwd (worktree root) and symlinks (`target`, `node_modules`) — baseline genuinely exercises compiled code (135 tests, snippet/RTK endpoints resolve), ruling out a false "both pass" from a broken harness.

### 5. reconstruction_failed
- **Category:** `no_unit_oracle__real_oracle_cypress` — the fix's unit-spec edit was mechanical (mock shape), and the load-bearing assertions live only in the Cypress e2e specs.
- **Still reconstructable?** Yes, but only against the Cypress oracle. Reintroducing the bug (removing the notebook redirect guard in `initializeQB.ts`) would make `reproductions.cy.spec.ts` "issue 58628" and the `notebook-link-to-data-source.cy.spec.ts` assertions fail — it cannot be reconstructed against the assigned Jest unit oracle.

Tree restored to clean (`git diff --stat` empty).
