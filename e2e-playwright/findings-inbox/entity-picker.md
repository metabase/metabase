# entity-picker (slot 3, port 4103)

Source: `e2e/test/scenarios/organization/entity-picker.cy.spec.ts` (1369 lines, 33 tests)
Target: `e2e-playwright/tests/entity-picker.spec.ts` + `support/entity-picker.ts`
Artifact: local CI EE uberjar `target/uberjar/metabase.jar` (COMMIT-ID `751c2a98`, built 2026-07-18), jar mode throughout.

## Summary (3 lines)

1. 32/33 executed and passing, 2/2 stable under `--repeat-each=2` (64 passed / 2 failed, both the same test).
2. The one failure — `should search for tables in a multi-schema database` — is **FINDINGS #85 shared-writable-container debris**, proven end to end (search API returns `Domestic.Animals` at rank **27 of 28**, below the virtualized render window); not port drift and not a product bug.
3. One upstream assertion is **provably vacuous** (`globalSearchTab().should("not.exist")`, ×4 tests) and one is **provably unmatchable** (`notFoundItems: ["First Collection"]`, capital C); both kept faithful and documented rather than silently strengthened or dropped.

## Executed vs gate-skipped, with the gate-OFF control

| run | passed | failed | skipped |
|---|---|---|---|
| `PW_QA_DB_ENABLED=1` (gate ON) | 32 | 1 | 0 |
| gate ON, `--repeat-each=2` | 64 | 2 (same test ×2) | 0 |
| **gate OFF (control)** | 30 | 0 | **3** |

The control is the point: with the gate off, 3 tests skip and 30 run; with it on, 0 skip and all 33 execute. So the gate-ON number is not green-by-skipping — the three `@external` tests (`multiple databases`, `multi-schema`, `schema-less`) really do drive the QA containers. Two of the three pass; the third is blocked by container debris (below).

## Container evidence (read the container FIRST — the brief was right)

Inventory of `writable_db` at session start, unmodified by me:

```
SCHEMAS: Domestic, Schema A … Schema Z, Wild, public
TABLES:  Domestic.Animals, Wild.Animals, Wild.Birds,
         "Schema A".Animals … "Schema Z".Animals,
         public.{compatible_target, composite_pk_table, many_data_types,
                source_table, target_extra_columns, target_missing_column,
                target_type_mismatch}
```

I did **not** drop anything (other QA-DB agents are live).

### The failing test, fully explained

`should search for tables in a multi-schema database` searches `anim` inside Writable Postgres12 and asserts a link matching `/animals.*wild/i` and one matching `/animals.*domestic/i` exist.

Measured on :4103 immediately after the port's run:

```
GET /api/database/2/metadata  -> 29 tables, schemas: Domestic, Schema A..Z, Wild
GET /api/search?q=anim&models=table&limit=50&context=entity-picker -> 28 results
   0: Wild.Animals
   1..26: "Schema Z".Animals … "Schema A".Animals
  27: Domestic.Animals        <-- the assertion's target, dead last
```

`SearchResults` renders through `VariableHeightVirtualizedList`; the DOM snapshot shows 16 rows (Wild, then Schema Z→L). `Domestic` is never in the DOM, so `getByRole("link", …)` — like testing-library's `findByRole`, which also only sees rendered DOM — cannot match it. On a clean container the same query returns **2** results at ranks 0 and 1 and both render.

### Why the Cypress cross-check *passes* — and why that is NOT "the port drifted"

The Cypress original passes this test in ~3s on the same backend, same container, `--browser chrome`. Measured cause, not inferred:

```
after the CYPRESS run:  GET /api/database/2/metadata -> 3 tables  (Domestic.Animals, Wild.Animals, Wild.Birds)
after the PORT   run:  GET /api/database/2/metadata -> 29 tables (+ Schema A..Z)
```

Both harnesses restore the `postgres-writable` snapshot, whose baked table metadata contains only those 3 tables. `H.resyncDatabase({ dbId })` with no `tables` returns on the first poll where any table is synced — which the snapshot satisfies instantly — so Cypress reads the picker **before the background sync discovers the 26 debris schemas**. The port passes `tables: ["Animals","Birds"]` (the PORTING rule) and therefore sleeps ≥500ms and re-polls, by which time the debris has landed.

So: the Cypress pass is itself an artifact of the same contamination, arriving via a race rather than via the assertion. Neither harness is measuring the intended thing on this container. **On a clean container both are deterministic and both pass.** I left the port faithful (no scrolling, no weakened assertion) rather than masking the environment.

Follow-on for #85: this is a second, independent failure *shape* for the shared container — the first was "a schema sorted after 26 injected ones never renders"; this one is "the port's more-correct sync gate is what exposes the debris, and the less-correct upstream gate is what hides it." Worth adding to #85 because it means **a green Cypress result on this tier is not evidence the container is clean.**

## Vacuous / unmatchable upstream assertions (2)

### 1. `globalSearchTab().should("not.exist")` — vacuous, in 4 tests

Every `should not allow local search for 'all personal collections'` test (data / question / collection / dashboard picker) asserts the "Everywhere" scope tab does not exist. Measured on the jar:

- immediately after `.type()` (upstream's instant, before the 300ms `SearchInput` debounce fires): **0** matches
- once the `/api/search` response lands and `SearchResultsItemList` mounts: **1** match

`SearchScopeSelector` lives *inside* `SearchResultsItemList`, so upstream is asserting the absence of something that has not rendered yet — the #73 mount-lag class. The selector does render, with a single "Everywhere" option, because `disableSearchScope` is not set for these pickers and `useGetLastCollection`'s `isValidScope` filters "All personal collections" out of the option list (`use-current-search-scope.ts`).

**Vacuous, or bad mutation?** Answered by asserting *presence* under the same conditions: `toHaveCount(1)` after the search resolves. The element is there. So the check samples too early — it is vacuous, not merely mis-timed.

The Cypress original passes all four on the same jar/backend (`--browser chrome`, 4 passing), confirming this is upstream's own timing accident and not port drift.

**Treatment**: I split the second half out and *strengthened* it — `localSearchTab("All personal collections").toHaveCount(0)` is now anchored on the search having resolved, which is the test's actual subject ("should not allow **local** search") and which genuinely holds. The `globalSearchTab` half is kept at upstream's instant as a documented one-shot count (`assertNoSearchScopeSelectorYet`, with the full analysis in its docstring), following the `entity-picker-shared-tenant-collection` / #45 precedent of staying faithful to the racy timing rather than shipping a red test on an upstream defect. Anchoring it turns it red.

**Open question for the product**, stated as a question and not a bug: should a scope selector render at all when it has exactly one option? The test author evidently expected it not to.

### 2. `notFoundItems: ["First Collection"]` — unmatchable

In the collection picker's inaccessible-root test, upstream asserts `findSearchItem("First Collection")` does not exist. The real collection is `"First collection"` (lowercase c) and `findByText` with a string is an exact match, so this assertion can never fail regardless of behaviour. Ported literally with an inline note.

## Mutation testing — 4 mutants, 4 killed, 2 of them at tail assertions

Inputs inverted, never expectations.

| # | mutation (input) | result | died at |
|---|---|---|---|
| A | `PUT /api/table/:id {display_name: "Eventz"}` instead of `"Events"` | **killed** | `foundItems:["Events"]` in the **second** block — the first block (`notFoundItems:["Orders"]`) still passed, so the tail is proven |
| B | `createTestCards`: "Regular" cards created in root (`collection_id: null`) instead of `FIRST_COLLECTION_ID` — a field no assertion references | **killed** (2 of 3 targeted tests) | the "regular collection" navigation in `testCardSearchForNormalUser`; First collection stops being offered once it holds no selectable content |
| C | path test picks `"Normal personal collection 1"` instead of `2` | **killed** | the **third and last** `data-active` assertion (line 735) — the first two passed, so the tail is proven |
| D | `createTestDashboards`: "Normal personal dashboard" created in the admin's personal collection | **killed** | the **final** block's `foundItems:["Normal personal dashboard 1"]`, after two search-scope tab switches — the earlier local/global/local blocks all passed |

One test legitimately *survived* mutation B — `should select a card from global search results` finds cards by global search regardless of collection, so the mutated input is genuinely irrelevant to it. Not vacuity.

All mutations were reverted from backups and the clean state re-verified (32 passed / 1 failed, tsc clean) — see the PORTING warning about a cancelled agent leaving a live mutation behind.

## Port gotchas worth feeding back to PORTING.md

- **`getByPlaceholder(/Search/)` for a picker search box must be scoped to the modal.** The mini picker's `"Search for tables and more..."` input stays mounted underneath the entity-picker modal, so the regex placeholder is a strict-mode violation. Upstream is implicitly scoped by `entityPickerModal().within()`. Fingerprint is clear (strict mode names both inputs), but only three of this spec's ~30 search calls use the regex form, so it hides until you hit them.
- **The picker's `data-active` attribute is the right pacing signal.** The established "pace parent→child clicks with a `toPass` re-click loop" trap has a natural gate here: every picker row carries `data-active`, and the spec itself asserts on it. `clickPickerItem` re-clicks until the row reports active. It needs a `leaf: true` escape hatch for the final click of a path that closes the modal (a table in the data picker, a dashboard in the save picker), where no post-click state survives.
- **`H.resyncDatabase({dbId})` vs `{dbId, tables}` is not just "one gates and one doesn't" — the two can see *different databases*.** Passing `tables` (the correct form) makes the port wait long enough for a background sync to discover schemas that the bare form races past. On a clean container this is invisible; on a shared one it is the whole ballgame. Add to the resyncDatabase bullet.
- **A wedged slot backend after a Cypress cross-check.** Running the Cypress original against :4103 left the slot backend unable to serve `POST /api/testing/restore/default` — every subsequent Playwright test timed out for 90s in `beforeEach` with `(reused)` in the log. `kill -9` + `rm -rf $TMPDIR/mb-pw-slot-3` fixed it. This is the existing "stale kept slot backends" bullet, but the *trigger* is new and specific: **do the Cypress cross-check last, or restart the slot backend after it.** Cypress's `H.restore()` does not re-point database 1 away from the shared H2 file, which is the plausible mechanism — but I did not isolate it, so record the trigger, not the cause.

## Not claimed

- No product-bug claims. The scope-selector observation is an open product question, deliberately not counted as a bug (#31).
- I did not establish *why* the Cypress cross-check wedged the slot backend, only that it did and how to recover.
- The multi-schema test has **not** been observed passing — I did not clean the container, so "it passes on a clean container" is an inference from the measured rank-27-of-28 ordering and the 3-vs-29 table counts, not a run I performed.
- The `1198px` / `1200px` / `1097px` / `920px` width assertions pass on Playwright's bundled Chromium here, but they are pixel-exact and therefore engine-sensitive (the SmartScalar precedent); no claim about other engines.
