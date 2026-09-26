# Reconstruction report — metabase#51934 (FE)

_Verbatim final report (a19947a0f04ae4c5f)._

---

## Reconstruction result: `reconstruction_failed`

### Category: `no_unit_oracle__real_oracle_cypress`
Reconstructable as unit oracle? **No.** Reconstructable at all? **Yes — via the Cypress E2E test the fix added.**

### What the fix did (commit b1bcf324)
Bug #51934 (EMB-189): when starting a join in the embedding data picker, the picker should open at a *sensible default step derived from the query source* — a table source → schema/table step in the same DB; a **model** source → the Models bucket opened to the source's collection; likewise questions. The product change lives in `DataSelector.jsx` `hydrateActiveStep()` (the `else if (this.isJoinStep())` branch keying off `querySourceType`) plus the `isQuerySourceModel`/now-`querySourceType` prop threaded through `EmbeddingDataPicker.tsx` and typed in `data-picker.ts`.

### Why there is no unit oracle
The fix's edits to the two named unit specs were **accommodations, not new behavioral assertions**:
- `DataSelector.unit.spec.js`: the fix *deleted* two tests ("should auto-advance past db and schema in field picker", "should select schema in field picker") and removed `nextMetadata.fields = {}` lines. Deletions cannot be "made to fail."
- `DataSourceSelector.unit.spec.tsx`: the fix only *added a required prop* (`isQuerySourceModel={false}`) to `setup()` so the suite kept compiling. No assertion about the new default-step behavior.

The real behavioral oracle the fix added is the Cypress test `e2e/test/scenarios/embedding/embedding-reproductions.cy.spec.js` → `describe("issue 51934 (EMB-189)")`, which drives the notebook UI, joins from table vs. model sources, and asserts the opened step and the brand-color highlight on the source collection. That flow is not exercisable by the jest component specs.

Crucially, **both current specs still pass `querySourceType={undefined}` in every case** (grep confirmed: no unit test ever passes `"model"`/`"question"`), so the model/question join branches — the heart of the bug — have zero unit coverage.

### Empirical confirmation (adversarial self-check)
I did not stop at reasoning. I performed the semantic revert — fully removed the `else if (this.isJoinStep())` special-casing from `hydrateActiveStep()`, reintroducing the pre-fix "no sensible default" behavior — and ran both oracles:

- Baseline `DataSourceSelector.unit.spec.tsx`: **Tests: 7 passed, 7 total**
- With bug reintroduced `DataSourceSelector.unit.spec.tsx`: **Tests: 7 passed, 7 total** (unchanged)
- With bug reintroduced `DataSelector.unit.spec.js`: **Tests: 12 passed, 12 total** (unchanged)

No unit assertion flips under the semantic revert. This proves the unit specs cannot discriminate the fix — the "should only show data from the selected database when joining data" test that *looks* relevant actually exercises the `getDatabases()` DB-filter, which predates this fix, and lands the same regardless.

### failure_shape
Semantic revert applied cleanly and reintroduced the bug behavior, but the discriminating behavior surfaces only in the DOM interactions of the full notebook (Cypress), not in any jest assertion → no unit oracle failure obtainable.

### Confidence: **High**
Empirically verified (not just inferred): the two candidate unit specs pass identically with and without the fix's core product logic. Working tree restored to baseline (`git diff --stat` clean); product file `DataSelector.jsx` reverted from the temporary probe.

### Ambiguity
None material. The task pointed at the two unit specs, but the fix's assertions there are non-behavioral; the genuine oracle is the Cypress reproduction. If a Cypress-based reconstruction is acceptable, the discriminating assertion is the source-collection brand-color highlight / opened-step check in `embedding-reproductions.cy.spec.js` "issue 51934 (EMB-189)".
