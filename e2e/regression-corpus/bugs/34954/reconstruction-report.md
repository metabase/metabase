Worktree restored clean. Here is the reconstruction result.

## reconstruction_failed (honest-negative)

**Category:** The fix's regression protection is **E2E-only (Cypress)**; the jest spec that shipped alongside it carried **no behavioral assertion**.

### (1) What the fix actually did
Fix commit `d1498403` (PR #35851, metabase#34954) — "embedding crashes when one of the cards fails to load." Two parts:
- **Real product change:** `frontend/src/metabase/dashboard/utils.ts`, function `hasRows` — added a `"data" in queryResult &&` guard so an error dataset (an `ErrorEmbedDataset` with no `data` key) no longer crashes on `queryResult.data.rows`. Also a type-only refactor in `frontend/src/metabase-types/api/dataset.ts` (`PublicDataset` → `EmbedDataset = SuccessEmbedDataset | ErrorEmbedDataset`).
- **Regression test added:** a **Cypress** test in `e2e/.../embedding-dashboard.cy.spec.js` asserting `"There was a problem displaying this chart."` renders "without crashing" (comment: *"The whole page would have crashed before the fix"*).

The jest change to `PublicQuestion.unit.spec.tsx` was purely a **mock-helper rename** (`createMockPublicDataset` → `createMockEmbedDataset`) — zero new assertions, not behavioral.

### (2) Oracle + baseline vs reconstructed
- **Oracle relocated:** `PublicQuestion/PublicQuestion.unit.spec.tsx` → `PublicOrEmbeddedQuestion/.../tests/PublicOrEmbeddedQuestion.common.unit.spec.tsx`. It exercises only the **success** path (`createMockEmbedDataset({ data: { rows: [["John W."]] }})` → "should render data"); no error-dataset case.
- **Discriminating candidate probed:** `frontend/src/metabase/dashboard/utils.unit.spec.ts` (only jest home of `getVisibleCardIds`/`hasRows`).
  - Baseline: `Tests: 114 passed, 114 total`
  - After semantic revert (removed the `"data" in queryResult &&` guard in `hasRows`): `Tests: 114 passed, 114 total` — **no test flips**.

Reason: none of the `getVisibleCardIds` fixtures (`loadingData`/`loadedEmptyData`/`loadedWithData`/pivot-totals) contain an error result lacking a `data` key, so the guard is never load-bearing under the current suite.

### (3) failure_shape
None — the target assertion does not exist in any jest spec. `grep` across `frontend` + `enterprise/frontend` shows **zero** spec usages of `getVisibleCardIds` outside `utils.unit.spec.ts`, and **zero** spec usages of `ErrorEmbedDataset`/an error-variant `createMockEmbedDataset`.

### (4) Confidence + adversarial
High confidence this is a true negative. Adversarial checks performed: (a) searched all specs for `getVisibleCardIds`, `ErrorEmbedDataset`, error-variant embed mocks — none feed the error path; (b) inspected the relocated PublicOrEmbeddedQuestion specs (common/enterprise/premium) — success-path only; (c) empirically ran the revert and observed 114→114 (no discriminator).

### (5) reconstructable?
**Yes, but not from the shipped jest spec.** A unit test *could* be authored (feed `getVisibleCardIds`/`hasRows` a dashcardData whose result is an error `EmbedDataset` with no `data` key, or render a `DashCard` with an error result, and assert no throw / the "problem displaying this chart" message). That test simply never existed at the jest layer — the fix relied on the Cypress E2E test, which is outside the jest oracle. So: reconstructable as new coverage, **not** reconstructable as a semantic revert of a surviving discriminating jest assertion.

Relevant paths:
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a7e049f8381de0cfd/frontend/src/metabase/dashboard/utils.ts` (product change, `hasRows`, line ~320)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a7e049f8381de0cfd/frontend/src/metabase/dashboard/utils.unit.spec.ts` (probed, non-discriminating)
- `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a7e049f8381de0cfd/frontend/src/metabase/public/containers/PublicOrEmbeddedQuestion/PublicOrEmbeddedQuestion/tests/PublicOrEmbeddedQuestion.common.unit.spec.tsx` (relocated oracle, success-path only)