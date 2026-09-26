# Reconstruction report — metabase#64340 (FE)

_Verbatim report (abfc8fe990d281460)._

---

Reconstruction succeeded. Report follows.

## 1. `git diff`
Single product-source file, `frontend/src/metabase/visualizer/utils/get-initial-state-for-card-data-source.ts` (4 insertions, 1 deletion):
- Initial state builder: `settings: {}` → `settings: { "card.title": card.name }`
- Non-funnel rebuild block: added `"card.title": card.name` back into the `state.settings = {...}` spread

## 2. Oracle + baseline vs reconstructed
- Oracle: `frontend/src/metabase/visualizer/utils/get-initial-state-for-card-data-source.unit.spec.ts` (via `bun run test-unit-keep-cljs`)
- Baseline: `Tests: 8 passed, 8 total`
- Reconstructed: `Tests: 7 failed, 1 passed, 8 total`

## 3. failure_shape
Genuine `expect(received).toEqual(expected)` deep-equality failures. Each failing test's `state.settings` now carries an unexpected `"card.title": <card name>` key (e.g. `+ "card.title": "gauge card"`), which the fix's tightened `toEqual` assertions reject. Not a compile/import error. The lone passing test only checks `display`, so it is correctly unaffected.

## 4. Confidence + adversarial reasoning
High confidence.
- The fix commit 734dabb removed `card.title`/`card.description` from settings in this exact source function AND removed the matching keys from the spec's `toEqual` blocks (relocating title propagation to render-time in DashCardVisualization/CartesianChart). The current HEAD spec is the post-fix, tightened version.
- I did NOT `git apply -R` the commit (that would also revert the spec and cypress files, hiding the failure). I hand-reintroduced only the buggy product behavior, leaving the fix-tightened spec assertions intact so they fail — the correct semantic revert.
- Both settings-construction sites were restored because the funnel/scalar path returns early (line 156) off the initial `settings` object, while the table/combo path replaces `state.settings` at line 237; restoring both makes all four affected assertion groups (table, combo, scalar-funnel, gauge-funnel) fail, matching the full pre-fix bug surface.
- I deliberately omitted `card.description` restoration: the fix also deleted the standalone "card description in settings (metabase#63863)" test, so no current assertion exercises it, and `createMockCard`'s default description is null (would not add a key). Adding it would be dead/noise. The `card.title` restoration alone cleanly drives the failures.

## 5. Ambiguity
Minor framing note: the task listed DashCardVisualization.tsx and CartesianChart.tsx as the product files to localize, but those govern render-time title propagation (exercised by the cypress specs in the same commit), not the `getInitialStateForCardDataSource` unit oracle. The load-bearing change for this unit oracle is in `get-initial-state-for-card-data-source.ts`, which is where I localized. No `reconstruction_failed` — the unit oracle is real and now fails as intended.
