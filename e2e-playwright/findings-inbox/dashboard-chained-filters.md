# dashboard-chained-filters (slot 4, port 4104)

Source: `e2e/test/scenarios/dashboard-filters/dashboard-chained-filters.cy.spec.js` (281 lines, 3 tests)
Target: `e2e-playwright/tests/dashboard-chained-filters.spec.ts`
Support module: **`support/dashboard-chained-filters.ts`** — the name the brief expected. Nothing loud to report.

## Collision checks

- `grep -rl "dashboard-chained-filters" tests/ support/` → **no hits** before I started. No pre-existing port of my source.
- `ls tests/ support/` → many `dashboard-filters-*` ports exist (matrix pages 0-10, `-source`, `-remapping`, `embedding-linked-filters`, …). I read the neighbouring support modules and **imported** from them; I created no duplicate helpers and edited no shared file.
- New file created: `support/dashboard-chained-filters.ts` (2 exports: `valuesWidget`, `WRITABLE_PG_SKIP_REASON`, plus a `HasFieldValues` type). Everything else comes from `dashboard.ts`, `dashboard-core.ts`, `dashboard-cards.ts`, `drillthroughs.ts`, `schema-viewer.ts`, `actions-on-dashboards.ts`, `ui.ts`, `sample-data.ts`.

## What the `beforeEach` restores, and whether the writable container is genuinely touched

The describe-level `beforeEach` is just `H.restore(); cy.signInAsAdmin();` — the plain **`default`** snapshot, H2 sample DB. Tests 1 and 2 (the actual chained-filter tests) never touch the writable container at all.

The writable container is touched by **test 3 only**, which does its own `H.restore("postgres-writable")` inside the test body.

**`WRITABLE_DB_ID` verified by identity, not by the literal.** On slot 4 after the run:

```
1 'Sample Database'      h2       {"db": "file:$TMPDIR/mb-pw-slot-4/sample-database.db;…"}
2 'Writable Postgres12'  postgres {"dbname": "writable_db", "host": "localhost", "port": 5404}
```

So under `postgres-writable`, DB 2 **is** genuinely the writable container (not the read-only `postgres-12` QA sample). Confirmed on `name` + `details.dbname` + port, as the brief demanded.

## Container before/after

Before and after are **identical**:

```
SCHEMAS: Domestic, Schema A … Schema Z, Wild, public   (29 schemas — the debris the brief describes)
many_data_types: [{"table_schema":"public","table_name":"many_data_types"}]
```

My test's only warehouse contact is `many_data_types`, which `resetTestTable` drops and recreates in `public`. It adds no new schema, no new table, and leaves no `%transform%` fixture for `transforms.spec.ts`'s cleanup to eat.

**The `schemas[0] === "Domestic"` hazard does not apply here — mechanism checked, not merely unobserved.** The port never enumerates schemas or uses a picker: it resolves the table by `name` from `GET /api/database/2/metadata` (which is exactly what upstream's `tableAlias` wraps). I verified against the live container that `many_data_types` exists in **exactly one** schema (`public`), so the name lookup cannot be ambiguous and cannot silently hit an empty foreign fixture.

**Virtualization hazard likewise checked, not assumed.** Mutation 2 (below) proved "Anacoco" *does* render in both widget types when the constraint is removed, so the target values are genuinely in the DOM and the ~20-row window never bites — the search term narrows the list to a handful of options before any assertion runs.

## Gate mapping + the gate-OFF control

| upstream | tag | port |
|---|---|---|
| `limit search options based on linked filter` | *(none)* | ungated |
| `limit list options based on linked filter` | *(none)* | ungated |
| `should work for all field types (metabase#15170)` | `@external` | `test.describe("15170")` + `test.skip(!process.env.PW_QA_DB_ENABLED, …)` |

The tag is **accurate** here — it is the only test that restores `postgres-writable` and drives the QA container. No stale/over-broad/red-herring variant.

Skip placed at **DESCRIBE level**. There is no `afterEach` in this spec, so the `beforeEach`-form trap could not fire, but I used the describe form anyway per the brief.

**Gate-OFF control (the only trustworthy signal):**

```
PW_QA_DB_ENABLED=1  → 3 passed        (tests 1,2,3 all executed)
PW_QA_DB_ENABLED unset → 2 passed, 1 skipped
                       ✓ limit search options …
                       ✓ limit list options …
                       -  15170 › should work for all field types
```

So the gate skips exactly one test and gates precisely something. Executed-vs-skipped reported both ways.

## Mutation results

Baseline md5 `0f2e5dd77a9622cda434e564ef1691cb`. Every mutation was applied with an **anchored replace asserting `count == 1`**, then **read back** and confirmed. Restored from a `s4-`-prefixed backup between each.

**My verifier caught a real error in my own mutation design**, which is the evidence that it works: my second attempt asserted the replacement text was absent before writing, and it fired — the block

```ts
valuesWidget(page, hasFieldValues).getByText("Anchorage", { exact: true })).toHaveCount(0)
```

already exists later in the file (the second checkpoint). Had I used a naive replace I'd have mutated two sites and mis-attributed the death. I also injected a known-unused import (`modal`) to sanity-check the dead-import checker: grep count came back `1` (import only) while **`tsc --noEmit` reported it as clean**, confirming the briefed claim that tsc misses dead imports and that my count-based check catches them. Real imports all score ≥ 2.

| # | mutation (input, not expectation) | result | where it died |
|---|---|---|---|
| 1 | **change the constraining filter**: first state selection `AK` → `GA` | **killed** | line 170 — `Anchorage` visible under State=AK. The core chained-filter assertion. |
| 2 | **remove the linkage**: don't click the linked-filters switch | **killed in BOTH tests** | line 175 — `Anacoco` absence, "resolved to 1 element". |
| 3 | don't clear the state filter before the final block (Escape instead of GA-deselect + Update) | **killed in `list`** at line 225 (`Adrian`); **died early in `search`** at `typeInValuesSearch` | *bad mutation for the search branch* — see below |
| 4 | final search term `"An"` → `"Anch"` | **killed in BOTH** | line 232 — `Adrian` visible |
| 5 | second state selection `GA` → `MI` | **killed in BOTH** | line 202 — `Canton` visible under GA (middle checkpoint) |
| 6 | (15170) `uuid` `semantic_type: "type/PK"` → `null` | **SURVIVED** | — |
| 8 | (15170) parameter mapping target `uuidFieldId` → `idFieldId` | **SURVIVED** | — |

**Calling out my own bad mutation:** #3 is only valid for the `list` branch. In the `search` branch the bare `Escape` closes the value dropdown differently, so the test died in the helper rather than at an assertion — that tells me nothing about the tail. I did **not** count it as a kill there; mutation #4 was designed specifically to cover the search branch's tail, and it killed both.

Aim of the follow-ups was explicitly the tails: #1 and #2 both died at the *head* (lines 170/175), so #5 was aimed at the middle checkpoint and #4 at the final block. Head, middle and tail are each independently killed in **both** parameterisations.

### The two survivors — answered with a presence probe

Per the brief, a survivor is a question. **Presence probe:** I replaced the 15170 final assertion's target with a string that cannot exist (`"UUID"` → `"UUID_PROBE_NOPE"`). It **failed** — so the assertion is **live**, not vacuous.

Therefore #6 and #8 are **non-discriminating inputs, not weak assertions**: the click-behavior "Update a dashboard filter" column dropdown offers `UUID` regardless of whether `uuid` carries `semantic_type: "type/PK"`, and regardless of whether the dashcard's `parameter_mappings` targets `uuid` or `id`.

That is an **upstream weakness**, recorded not strengthened (hard rule: weak-but-faithful is recorded). Upstream's own setup comment — *"Mimics that UUID is the table's primary key, so we could map dashboard ID parameter to UUID"* — describes an intent the final assertion cannot actually discriminate. Roughly two thirds of that test's body (the two `PUT /api/field` calls and the `parameter_mappings` PUT) is provably not load-bearing for its single assertion. Worth a look if anyone ever revisits #15170, but I made no change.

I could not induce a failure of the 15170 assertion from any *semantically meaningful* input change I tried — only from corrupting the expected string. **Stated as: not triggered by any failure mode I could induce**, beyond the two above.

## Fixmes

**None.** All 3 tests pass, and 9/9 under `--repeat-each=3`. No `test.fixme`, no product-bug claim, so the jar-vs-source artifact question never arose as a decider (I ran on the jar throughout regardless).

## Verification

Backend verified **by identity**, not by `JAR_PATH`: slot 4 is pid 14266, `java -jar …/target/uberjar/metabase.jar`, listening on 4104; `GET /api/session/properties` → `version.hash = 751c2a9`, matching `target/uberjar/COMMIT-ID` = `751c2a98`. Never touched port 4000.

```
3 passed (11.0s)                    # gate ON
2 passed, 1 skipped (7.9s)          # gate OFF control
9 passed (30.4s)                    # --repeat-each=3
bunx tsc --noEmit                   # clean, no output
```

Dead imports checked **by hand** (grep count per identifier; all ≥ 2 = import + use), with the checker sanity-checked by injecting a known-unused import as described above. `tsc` produced **no** output at all, so there was no sibling noise to attribute.

**Spec restored byte-identical: final md5 `0f2e5dd77a9622cda434e564ef1691cb` == baseline. Confirmed, and `grep -c MUT` = 0.**

## Notable port decisions (fidelity)

- `cy.findByRole("switch").parent().get("label").click()` — `cy.get` inside `.within()` re-queries from the within-scope root, so upstream really means *"the single `<label>` in the tabpanel"*, not "the switch's parent's label". Ported as exactly that, with `toHaveCount(1)` to preserve Cypress's single-element `.click()` requirement. I deliberately clicked the **label**, not the `role="switch"` input, against PORTING rule 4's default: upstream's own comment says the input has 0 width/height, so rule 4's `{force:true}` input click would be a different interaction. Mutation 2 proves the label click genuinely establishes the linkage.
- `H.filterWidget().contains("Location")` resolves to the **innermost** matching descendant of the first matching widget. Ported as `filterWidget().filter({ hasText: /…/ }).first()` — the widget element rather than the text node. Same click outcome (the widget is what opens the popover), strict-mode safe, and it sidesteps the briefed `.contains()`-lands-on-a-text-node trap since I never assert an attribute off it.
- **`getByText(..., {exact:true})` vs testing-library `getNodeText` asymmetry — checked, does not bite here.** The city/state options are plain text nodes with no nested elements, so Playwright's full-`textContent` read and testing-library's direct-child read agree. Crucially I did **not** just assume this for the `not.exist` checks: mutation 2 forced `Anacoco` to be present and the `toHaveCount(0)` fired with *"resolved to 1 element"* in both widget types — direct proof the absence matcher can see the element it is asserting the absence of. No `directText()` XPath needed.
- Absence assertions use `toHaveCount(0)` (retrying), never `expect(await count()).toBe(0)`, and never a bare `toBeHidden()`.
- Upstream's list-mode third block uses `findByRole("combobox")` where the first two use `findByPlaceholderText("Search the list")`. These resolve to the same input; I normalised on the placeholder in `typeInValuesSearch`. Noted as a deliberate normalisation of an upstream inconsistency, not a behaviour change.
- Typeahead uses `pressSequentially`, not `fill` (rule 5) — the value list filters on real keystrokes.
- **No `cy.intercept`/`cy.wait` alias exists anywhere in this spec**, so there is no queue to port and no "does it await anything at all" hazard (rule 2 checked, not skipped).
- **No URL assertion upstream** — I checked for `cy.location`/`cy.url` and there are none, so no `toHaveURL` was owed. Mutation design followed the brief's `last_used_param_values` warning: every inversion **changes** the constraining filter (#1 AK→GA, #5 GA→MI) rather than removing a parameter.
- **Toast strict-mode hazard checked at the mechanism**: the spec asserts on no toasts and `saveDashboard` doesn't either, so `UndoListing`'s Cypress-only `MockGroup` branch is never exercised. Banked, not merely unobserved.
- 1280×720-vs-800 viewport: no assertion here is layout- or scroll-dependent, so nothing to attribute there.

## Unexplained

The two chained-filter tests run fast (4.9s / 2.5s) for ~40 UI interactions each, and 15170 runs in 2.4s despite a `postgres-writable` restore + table rebuild + resync. I was suspicious this meant steps were being skipped, so I did **not** write it off: mutation testing settles it — every assertion in every position is demonstrably live and the flows demonstrably execute. Jar mode plus a warm reused backend is the plausible explanation, but I did not measure it directly, so I am recording the speed as **noted-and-resolved-by-mutation** rather than claiming a mechanism.

## 3-line summary

Ported cleanly: 3/3 green on the jar, 9/9 under `--repeat-each=3`, tsc clean, spec restored byte-identical (md5 confirmed). The `@external` gate is accurate and the gate-OFF control skips exactly the one writable-container test; DB 2 verified by name/dbname as the genuine writable postgres, and the container is byte-for-byte unchanged before and after.
Five input mutations killed the chained-filter assertions at head, middle and tail in **both** parameterisations; two survivors on the `#15170` test were run down with a presence probe and are an **upstream** weakness (its `semantic_type` and `parameter_mappings` setup provably don't affect its only assertion) — recorded, not strengthened.
