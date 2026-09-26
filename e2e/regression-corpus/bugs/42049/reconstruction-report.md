# Reconstruction report — metabase#42049 (FE)

_Verbatim final report (a24221d6d8642253d)._

---

My investigation is complete. This is a definitive **moved-target honest-negative**.

## reconstruction_failed

**category: moved-target** (fix mechanism fully refactored away + oracle's discriminating data removed)
**reconstructable? No** — not against the current oracle spec.

### What the fix did (commit 1fe63c52, #42344)
Bug #42049 = "wrong columns order." Columns were matched to viz `columnSettings` by a **ref-based key that included `base-type`**, so a column and its setting referencing the same field with different `base-type` (e.g. `type/Text` vs `type/Number`) failed to match → wrong order. The fix threaded an `ignoreBaseType` flag through `getColumnKey(column, true)`, a new `getColumnSettingKey(setting, true)`, and `getBaseDimensionReference(mbql, ignoreBaseType)` so base-type was stripped before matching. The fix-added assertions were the two "different base-type → `[0]`" tests.

### Why it can't be reconstructed
1. **The fix's product code no longer exists.** Commit `28513ae8866` (#45180, "Remove field ref matching from `table.columns`") deleted the entire mechanism. `dataset.ts` now matches purely by `column.name` / `columnSetting.name`:
   - `frontend/src/metabase-lib/v1/queries/utils/get-column-key.ts` — **deleted** (there's now a `column-key.ts` whose `getColumnKey` just returns `["name", column.name]`).
   - `getColumnSettingKey`, `ignoreBaseType`, `getBaseDimensionReference(...ignoreBaseType)` — **zero occurrences** anywhere in `metabase-lib`.
   Name-based matching ignores base-type *structurally*, so it satisfies the fix's assertions by construction, not by the fix's logic.

2. **The oracle's discriminating data was also removed.** In the fix's spec, each `columnSetting` carried a `key`/`fieldRef` with a concrete `base-type` (`type/Number`) to mismatch against. The current spec's settings are all `createMockTableColumnOrderSetting({ name: "TOTAL", enabled: true })` — no `key`, no `fieldRef`, no base-type. All six tests share an **identical** columnSetting; the only thing that varies across the "with/without/different base-type" tests is `column.field_ref`'s base-type, which has no comparison partner.

3. **No product-only edit fails exactly the two target assertions.** To fail only T3 (`findColumnIndexesForColumnSettings`, Text) and T6 (`findColumnSettingIndexesForColumns`, Text) while keeping T1/T2 (Number) and T4/T5 (null/Number) green, matching would need to succeed for base-type ∈ {Number, null} and fail for Text — against a name-only setting that carries no base-type. Any base-type-inclusive column key vs a name-based setting key mismatches for **all six** tests (breaking the four that must stay green); no faithful matching function treats `type/Text` as special relative to `type/Number`/`null`. The original bug keyed on *equality of base-type between two refs* — a condition the current spec can no longer express. Reintroducing it would require editing the oracle's test data, which is out of scope.

### Evidence
- Oracle baseline: `Tests: 6 passed, 6 total` (harness confirmed working via symlinks; ran from worktree root).
- No reconstructed run — no product-only change can produce the required failure, so I did not thrash on a doomed edit. `git diff` is empty.
- failure_shape: n/a (no reconstruction produced).
- confidence: **high**. Adversarial cross-check: I verified via `git log`/`git show` that #45180 removed the mechanism, confirmed the three fix artifacts have zero grep hits, confirmed `get-column-key.ts` is deleted, and confirmed the mock produces a base-type-free setting — so the six current assertions are trivial name-match tests that no longer exercise the bug at all.
