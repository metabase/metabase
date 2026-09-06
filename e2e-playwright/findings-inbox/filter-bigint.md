# filter-bigint (slot 5, port of `e2e/test/scenarios/filters/filter-bigint.cy.spec.ts`)

Target: `tests/filter-bigint.spec.ts` (11 tests) + `support/filter-bigint.ts`.
Verified on the local CI uberjar (`target/uberjar/COMMIT-ID` = `751c2a98`, 2026-07-18),
slot 5 / :4105, `--workers=1`.

## Executed vs gate-skipped (reported separately, per FINDINGS #67/#49)

| run | executed & passed | gate-skipped | failed |
|---|---|---|---|
| `PW_QA_DB_ENABLED=1`, single | **11** | **0** | 0 |
| `PW_QA_DB_ENABLED=1`, `--repeat-each=2` | **22** | **0** | 0 |
| gate OFF (control) | 6 | **5** | 0 |

The gate-off control is the important line: it proves the 5 QA-DB tests are
really gated and that the gate-on run was not a green-by-skipping.

Gated tests (need the writable postgres container + `postgres-writable`
snapshot): `dashboards + mbql query + id parameters`, `query builder + native
query + field filters`, `query builder + expression editor`, `query builder +
object detail`, `query builder + export`.

Ungated (native SQL against the sample DB, run on the bare jar): `query builder
+ mbql query`, `dashboards + mbql query + number parameters`, `query builder +
native query + variables`, `dashboards + native query + variables`, `query
builder + drills`, `dashboards + click behavior`.

`tsc --noEmit`: clean. **Zero fixmes. Zero tests dropped, weakened or merged.**

## Did the QA-DB path actually get exercised? Yes — checked, not assumed

After a gate-on run I read the container directly:

```
bigint_pk_table.id   bigint          → -9223372036854775808 / 0 / 9223372036854775807
decimal_pk_table.id  numeric(38,0)   → -9223372036854775809 / 0 / 9223372036854775808
```

Exactly the schema and rows `e2e/support/test_tables.js` builds. So the tables
were created by this port's `resetTestTable`, the resync surfaced them, and the
tests queried them.

## Is precision preserved end-to-end? Yes for everything the spec asserts

The spec exists because these values are outside the JS safe-integer range
(`Number.MAX_SAFE_INTEGER` = 2^53−1; these are ±2^63). The FE keeps them as
`bigint` — `metabase/utils/number parseNumber` falls through to `BigInt(value)`
for integer strings that aren't safe integers, and the filter inputs are
`BigIntNumberInput` (a Mantine `TextInput`, not a numeric input).

Rule I held to in the port: **no value goes through `Number()` anywhere.**
Filter values are typed as strings, every assertion compares strings, and the
writable-DB rows are inserted as strings (as upstream does). Row *counts* are
the only numbers in the file.

Three mutation probes, all killed — so this isn't a claim, it's measured:

1. **Rounding the typed input only** (input mutated, expectation left alone —
   avoiding the "shrank both sides" non-inversion): typing
   `String(Number(maxValue))` = `9223372036854775808` while still expecting
   `NUMBER is equal to 9223372036854775807`. → **fails**. The notebook filter
   pill tracks the exact digits, so a rounding regression anywhere between the
   input and the pill is caught.
2. **Corrupting the QA-DB fixture** one digit at the boundary
   (`…807` → `…806` for `bigint_pk_table`) — something no assertion in the file
   references, so the expectations can't move with it. → **3 of 3 gated tests
   fail** (id parameters, field filters, object detail). Confirms the gated
   tests read real container data at full precision.
3. **Absence-assertion inversion** in `dashboards + click behavior`: asserting
   `toHaveCount(0)` on the value that *is* present after the crossfilter. →
   **fails**, i.e. the DOM was settled and populated when the real absence check
   runs. Not vacuous.

**Stated gap (not a finding, a scope caveat):** `query builder + export` does
**not** verify the exported digits. Upstream passes no callback to
`H.downloadAndAssert`, so it only asserts the export request succeeds; our
shared helper additionally parses the file but asserts only `rows.length > 0`.
Note that if anyone later strengthens that call site, `readSheetRows` goes
through `XLSX`, which will coerce these cells to JS numbers and silently lose
the precision — asserting on its output would be the exact trap this spec is
about. Assert on the raw file text instead.

## Fixes needed during stabilisation (1 real one)

**Known gotcha, hit verbatim — the MultiAutocomplete blur trap** (PORTING,
batch-12: "Submitting a form while a `MultiAutocomplete`/`PillsInput` holds
focus silently does nothing"). Only one failure in the whole port, and this was
it.

The surprise worth recording: it fires on the **filter-picker value input**, not
just the ID parameter widget. `NumberFilterPicker` renders a plain
`BigIntNumberInput` only when no value picker is needed; for a column with field
values (this spec's `NUMBER`) the single-value case renders
`NumberFilterValuePicker`, a **combobox with pills**. So `getByLabel("Filter
value")` resolves a `MultiAutocomplete`, and the subsequent
`getByRole("button", {name: "Add filter"}).click()` was swallowed.

Fingerprint, for the next person: the failure surfaces two steps later at
`getNotebookStep("filter")` "element(s) not found", and the error-context
snapshot shows the **pill committed and the popover still open** — i.e. the
value went in fine and the button simply never received a click. Fix is the
documented one: `blur()` the input, then click.

Classification: *known gotcha*. No brief change needed beyond noting that the
trap applies to the filter picker's value input, which reads like an ordinary
number field.

## Deviations from a literal transcription (all documented in the spec header)

- **`popover(page)` settle after picking a filter operator.** Upstream's
  `H.popover().eq(1)` targets the Mantine Select dropdown stacked on the filter
  picker; once it closes, `popover(page)` must resolve to one element or the
  following calls are strict-mode violations. Added
  `await expect(popover(page)).toHaveCount(1)` as a settle. Not an assertion
  about the app.
- **One anti-vacuity anchor added** in `dashboards + click behavior`: gate on the
  dashcard's loading indicator being gone before the `not.exist` → `toHaveCount(0)`
  port. Upstream's two assertions are kept in their original order. Probe 3 above
  shows the anchor does its job.
- **`signInAsAdmin()` inside `setupTables`** after `restore("postgres-writable")`.
  Harness plumbing, not test semantics: Cypress rides an implicit cookie session,
  our `MetabaseApi` needs an explicit `X-Metabase-Session` re-established against
  the freshly restored app DB.
- Upstream tags the id-parameters test `{ tags: "external" }` — **without the
  `@`**, so the repo's `grepTags="-@external"` filter never matches it and it
  presumably runs (and needs the writable DB) in CI legs that intend to exclude
  it. Its body calls `setupTables()` exactly like the `@external` siblings, so
  the port gates it on `PW_QA_DB_ENABLED` with the rest. Flagging the upstream
  tag typo rather than silently normalising it.

## Reuse / consolidation notes

- `support/filter-bigint.ts` carries a knex `resetTestTable` for
  `bigint_pk_table` / `decimal_pk_table`. `support/actions-on-dashboards.ts` has
  the same knex plumbing for `scoreboard_actions` / `many_data_types`, and
  `support/schema-viewer.ts` has a third copy of the writable-PG connection
  config. Upstream has exactly one `test_tables.js`, so **a shared
  `support/test-tables.ts` (connection config + a table-name-keyed builder map)
  is a clean, faithful consolidation target** — I deliberately did not widen a
  file another agent owns mid-wave.
- Everything else was reused read-only: `filterInNotebook` (metrics.ts),
  `filterWidget` (dashboard-parameters.ts), `getTableId`/`resyncDatabase`
  (schema-viewer.ts), `getFieldId` (table-editing.ts), `visitPublicDashboard`/
  `visitEmbeddedPage` (question-saved.ts), `visitPublicQuestion` (sharing.ts),
  `downloadAndAssert` (downloads.ts), plus the canonical factories.

## Not verified

- No Cypress cross-check was run — nothing failed, so there was no fidelity
  question to settle.
- Verified only against the **local** jar (`751c2a98`, 2026-07-18). CI builds a
  merge with master (FINDINGS #79), so this port is unverified against whatever
  upstream has done to the filter picker since.
- The mysql/mongo writable legs are untouched — this spec is postgres-only
  upstream.

## 3-line summary

Full 11/11 port with no fixmes and no weakened assertions; 22/22 under
`--repeat-each=2`, tsc clean. All 5 QA-DB tests genuinely executed against the
writable postgres container (verified by reading the tables and by killing them
with a one-digit fixture corruption), and precision is preserved end-to-end
everywhere the spec asserts it — proven by three mutation probes, not assumed.
The single stabilisation fix was the already-documented MultiAutocomplete blur
trap, which turns out to fire on the filter picker's value input too.
