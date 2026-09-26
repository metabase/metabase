# Reconstruction report — metabase#57113 (FE)

_Verbatim report (ab89cf2cabecddd60)._

---

Tree is clean (reverted to fixed state). 

## reconstruction_failed

**Category:** `no_unit_oracle__real_oracle_cypress`

### Investigation

Fix commit `4578d66` ("Fix some modals not closing properly without browser history", PR #65370) changed ~20 modal files so the Cancel/close action routes through `onClose` instead of the removed `onCancel` prop. In the two named oracle specs, the commit's *only* change was deleting the now-unused `onCancel: jest.fn()` line from each `getProps` helper — it added/modified **no assertions**.

### Why it's a non-discriminating oracle

Both oracle specs assert only submit behavior:
- `DeleteEventModal.unit.spec.tsx` — clicks "Delete", asserts `onSubmit` called.
- `EditTimelineModal.unit.spec.tsx` — edits Name, clicks "Update", asserts `onSubmit` called with new name.

Neither exercises the Cancel button or asserts anything about `onClose`/`onCancel`. The bug (Cancel wired to `onCancel` instead of `onClose`) is orthogonal to the submit path.

### Empirical confirmation
1. **Baseline** (fixed HEAD): `Tests: 2 passed, 2 total`.
2. **Reconstructed** (faithfully reintroduced the bug in both components — re-added `onCancel` to the interface/destructure and rewired Cancel: `onClick={onClose}` → `onClick={onCancel}` for Delete, and `onCancel={onClose}` → `onCancel={onCancel}` for Edit): `Tests: 2 passed, 2 total` — **still passing**.

The bug's real regression oracle is the Cypress e2e test the same commit added in `e2e/test/scenarios/admin/troubleshooting.cy.spec.js` (`describe("issue 57113")`), which drives the Task-details modal close and asserts `cy.location("pathname")` navigates back to `/admin/tools/tasks`. That behavior (navigation on close with an empty history stack) cannot be expressed in these jest unit specs.

### Reconstructable?
**No** — not at the unit level with the given oracles. The failure shape would only manifest as a Cypress e2e assertion failure (navigation/routing), not a jest assertion failure.

### Confidence & adversarial check
High confidence. Adversarial self-check: I verified there is no hidden Cancel/close assertion in either spec (full file contents read), confirmed the specs' last touch was the fix commit itself (no later drift added assertions), and empirically ran a faithful bug reintroduction that left both specs green. Tree restored to fixed state; `git diff` is empty.
