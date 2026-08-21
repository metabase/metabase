# custom-column-3

Port of `e2e/test/scenarios/custom-column/custom-column-3.cy.spec.js` (908 lines,
no gating tags) → `tests/custom-column-3.spec.ts`. Verified on the jar (slot 8):
**48 passed, 6 skipped under `--repeat-each=2`**, tsc clean. New helpers in a new
file `support/custom-column-3.ts` only.

27 tests total. 24 executable (all green ×2); 3 gated as skips (the `postgres-12`
QA-DB describes: splitPart ×2, today() ×1).

## Fixes, classified

- **Known gotcha (gate naming).** The two `H.restore("postgres-12")` describes
  (splitPart, today()) drive QA Postgres12, which the spike doesn't provision.
  First cut gated on `QA_DB_ENABLED` — which **leaks in from cypress.env.json and
  is truthy on this dev box**, so the tests RAN and failed. Re-gated on the
  deliberate `PW_QA_DB_ENABLED` (the wave-8 note already records this; the
  existing `sql-field-filter-types.spec.ts` precedent uses the leaky one and would
  behave the same way — a latent trap for anyone who copies it). No product
  finding.

- **Known gotcha (off-screen dnd-kit → synthetic events).** The two aggregation
  reorder tests use `H.moveDnDKitElementByAlias("@dragElement", { horizontal:
  -400, useMouseEvents: true })`. Ported first with the real-mouse
  `moveDnDKitElement` (dashboard-cards.ts); the drag silently no-op'd because
  `horizontal: -400` lands the destination off-screen-left, which a real mouse
  can't reach. **The failure surfaced two steps away**, not at the drag: the
  reorder didn't happen → the query was unchanged → the follow-up `H.visualize()`
  clicked "Visualize" but no `POST /api/dataset` fired (results already cached) →
  `waitForResponse` 30s timeout inside the shared `visualize` helper. Fix: use
  `moveDnDKitElementSynthetic` (question-settings.ts), the exact port of
  `useMouseEvents: true` — dispatches MouseEvents on the element with computed
  clientX/Y, so off-screen coordinates are fine. Reinforces the wave-10 rule
  ("dnd-kit drags of elements clipped by / past the fold → synthetic MouseEvent
  sequence"). Worth noting the symptom (a cached-query Visualize that never
  re-fires /api/dataset) as a fingerprint for a dead drag.

## New helper surface (support/custom-column-3.ts)

Ports of the `H.CustomExpressionEditor` (CodeMirror) helper family that the spec
uses directly rather than through `enterCustomColumnDetails`:
`focusCustomExpressionEditor`, `clearCustomExpressionEditor`,
`customExpressionEditorType` (with `{rightarrow}` etc + `focus:false`),
`expectCustomExpressionValue` (reads `.cm-line`s, skips placeholder, polls),
`customExpressionCompletion(s)`, `functionBrowser`, `customExpressionName`,
`formatExpression`; plus `setModelMetadata`, `assertLastColumnData`,
`scrollTableRight`, and scoped notebook-action helpers
(`summarize/filter/addCustomColumn/join/sortInStep`) — the unscoped joins.ts
versions match every stage's `action-buttons` row under a multi-stage query, so
the `H.getNotebookStep(...).within(...)` calls need step-scoped variants.

## No product findings / no fidelity cross-check needed

Every executable test passed against the jar with no drift, so no `test.fixme`
and no Cypress cross-check was required. The CodeMirror expression editor typed
faithfully with `page.keyboard.type` (auto-close brackets + type-over behave the
same as the upstream `realType`), consistent with the existing joins.spec.ts
custom-column typing.

## Dividend flagged (for FINDINGS consideration)

The dead-drag → cached-Visualize-timeout signature is a clean, reusable
diagnostic: when a `visualize()`/dataset wait times out *after* a dnd reorder,
suspect the drag, not the wait.
