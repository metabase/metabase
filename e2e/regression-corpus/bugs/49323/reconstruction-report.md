I have a definitive picture. The fix was rolled back and its spec deleted. Here is the reconstruction report.

## 1. git diff — the semantic revert
**none.** No product mutation was applied. There is no fix-embodying code at HEAD to semantically revert. The worktree product tree is unchanged (only the harness `target`/`node_modules` symlinks were added).

## 2. Oracle
- **Shipped spec (gone):** `frontend/src/metabase/components/FieldValuesWidget/FieldValuesWidget.unit.spec.tsx` — the discriminating test `has_field_values = search › multi = false › "should call fetchFieldValues" → expect(fetchFieldValues).toHaveBeenCalledWith(field)`.
- **Closest surviving spec:** `frontend/src/metabase/parameters/components/widgets/ParameterFieldWidget/ParameterFieldWidget.unit.spec.tsx` (`search mode, single value` block).
- **Command:** `bun run test-unit-keep-cljs .../ParameterFieldWidget.unit.spec.tsx` (from worktree root).
- **Baseline (clean HEAD):** PASS — Tests: 14 passed / 14 total.
- **Reconstructed:** n/a — no mutation possible (see Outcome).

## 3. failure_shape
None. No jest assertion can be made to fail by reintroducing the bug, because the fix's behavior is already absent from HEAD product code (it was reverted).

## 4. Confidence + adversarial
High confidence this is a **dead target**, established from git history, not guesswork:

- Fix `896c516d98` (#49323) added, in `FieldValuesWidget.tsx`, `isSingleValueSearch = valuesMode === "search" && !multi && !disableSearch`, folded it into `isListMode`, gated `fetchValues()` in `useMount` on it, and shipped the discriminating spec (`multi = false › should call fetchFieldValues`).
- `git log -S isSingleValueSearch` returns exactly two commits: the fix, and `b7950cd10e4` **"Partial rollback of FieldValuesWidget to v50" (#51183)**. That rollback deleted the `isSingleValueSearch` product logic *and* collapsed the spec's `describe("multi = false"){ "should call fetchFieldValues" }` back to the pre-fix non-discriminating `"should not call fetchFieldValues"`.
- The spec file was then deleted outright by `01eb3ac384b` **"Remove dead code from FieldValuesWidget" (#56739)**.
- The component relocated to `frontend/src/metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/FieldValuesWidget.tsx`, but in the rolled-back v50 shape: `useMount` fires only on `shouldList(...)` (false for search params), and `isListMode` requires `valuesMode === "list"`, so a single-value **search** parameter renders the freeform `TokenField` — never a list picker and never a mount-time fetch. `SingleSelectListField` survives but is reachable only in list mode (`isListMode && hasListValues && !multi`), a different code path than the fix touched.
- No surviving jest spec anywhere asserts fetch-on-mount / list-picker for single-value search (grep for `fetchFieldValues`/`fetchParameterValues` in param/field specs returns nothing). The surviving `ParameterFieldWidget` "search mode, single value" tests exercise the v50 freeform-search interaction (type `f` → search endpoint returns `foo`), which is orthogonal to the reverted fix — they stay green regardless.

## 5. Outcome
**reconstruction_failed — category: dead_target.**

The fix's product logic was deliberately reverted (#51183, "rollback to v50") and its regression spec was collapsed then deleted (#56739). Nothing at HEAD embodies the fixed behavior, so there is no semantic revert to apply and no surviving discriminating jest assertion to flip. This is not merely a relocation/rename (class `all_specs_gone` holds: the shipped spec has no behavior-preserving descendant) — the feature itself was rolled out of the product.

Not closable with a new unit test in any meaningful corpus sense: the current intended behavior is the *pre-fix* (v50) behavior, so a test protecting issue #49323's fix would contradict the shipping product.