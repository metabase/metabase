# admin-datamodel-reproductions

Port of `e2e/test/scenarios/admin/datamodel/reproductions.cy.spec.ts` (484 lines,
8 describes, 9 tests) → `e2e-playwright/tests/admin-datamodel-reproductions.spec.ts`.
Slot 1 (:4101).

## Collision checks

- `grep -rl "datamodel/reproductions.cy.spec\|admin-datamodel-reproductions" tests/ support/`
  → **no hits**. No pre-existing port, committed or uncommitted.
- `ls tests/` / `ls support/` → no `admin-datamodel-reproductions.*` present before
  this session.
- **Support module name is `support/admin-datamodel-reproductions.ts`** — the
  expected name, matching the spec basename. No dangling-import risk.
- `tests/admin-datamodel.spec.ts`, `tests/datamodel-data-studio.spec.ts`,
  `tests/datamodel-segments.spec.ts` and `tests/data-model-shared-1..3.spec.ts`
  were read; no collision. Helpers were imported read-only from
  `support/data-model.ts`, `support/admin-datamodel.ts`,
  `support/datamodel-data-studio.ts`, `support/filters-repros.ts`,
  `support/command-palette.ts`, `support/schema-viewer.ts`. **No shared support
  module was edited.**

## Infra tier per describe, with gate-OFF control

| describe | tier | gate |
| --- | --- | --- |
| 17768 | sample DB | none |
| 18384 | sample DB | none |
| 21984 | sample DB | none |
| 15542 | sample DB | none |
| **52411** | **QA DB (writable postgres)** | `PW_QA_DB_ENABLED` (`@external` upstream) |
| 53595 | sample DB | none |
| 55617/55618 (×2) | sample DB | none |
| 55619 | sample DB | none |

No describe needs an EE token — every surface here is OSS.

**Gate-OFF control run** (`PW_QA_DB_ENABLED` unset, everything else identical):
`8 passed, 1 skipped`. Same result as the gate-ON run modulo the QA test, so no
ungated describe has a hidden QA-DB or token dependency.

Verification loop: jar mode, `JAR_PATH=target/uberjar/metabase.jar`,
`PW_PER_WORKER_BACKEND=1 PW_KEEP_SLOT_BACKENDS=1 PW_SLOT_OFFSET=1
PW_QA_DB_ENABLED=1 PW_ACTION_TIMEOUT=30000 TZ=US/Pacific`, `--workers=1`.
**Jar verified BY IDENTITY, not by `JAR_PATH`**: the process on :4101 is
`java -jar …/target/uberjar/metabase.jar` and
`/api/session/properties → version.hash = 751c2a9`, matching
`target/uberjar/COMMIT-ID = 751c2a98`.

Final: **32 passed, 4 skipped** under `--repeat-each=4`. `bunx tsc --noEmit`
clean (zero errors, mine or anyone else's).

---

## FIXME — candidate product regression (52411)

`issue 52411` is `test.fixme`. The "Filter by table" picker on
`/admin/datamodel/segments` **never renders a database list**: it opens straight
on Sample Database's *table* list, so `Writable Postgres12` cannot be clicked and
the upstream flow is unreachable.

**Measured, not inferred.** With the popover open, its full `innerText` was
sampled every 100 ms for 4 s: `"Sample Database / Orders / People / Products /
Reviews"` at **every** sample including t=0. So it is not a mount race (an anchor
on the second database being present in the sidebar tree changed nothing), not
popover scoping (the dialog's own text was dumped), and not virtualization
(4 options, no scroll container).

**Root cause located in product source.** `skipSteps()`
(`frontend/src/metabase/querying/common/components/DataSelector/DataSelector.tsx:707-725`)
fires whenever `useOnlyAvailableDatabase` — which `UnconnectedDataSelector.defaultProps`
sets to `true` — is on and no database is preselected, and auto-selects
`enabledDatabases[0]`. Its guard used to be:

```js
if (databases && databases.length === 1) { this.onChangeDatabase(databases[0]); }
```

and commit **`2a6741df9cf`** ("Do not pick unsupported databases automatically in
transforms", #64406, 2025-12-18, ancestor of `origin/master`) widened it to:

```js
const enabledDatabases = databases.filter((db) => !databaseIsDisabled?.(db));
if (enabledDatabases.length >= 1) { this.onChangeDatabase(enabledDatabases[0]); }
```

`=== 1` → `>= 1`. With two databases loaded the DATABASE step is now always
skipped (and then SCHEMA too, Sample Database having one schema). The commit's
stated intent was about *unsupported* databases; the widening from "exactly one"
to "at least one" looks unintended.

**Why this measurement discriminates**: it observes two databases in the store
*and* the database step skipped — a state impossible under the old `=== 1`
condition.

**Dating**: the 52411 describe was added `9315a633b39` (2025-01-21) and last
touched `666bf41aa26` (2025-01-30) — it predates the widening by ~11 months and
has not been revisited. It is `@external`, so it only runs on the QA-DB lane.

**SCOPE CAVEAT — stated plainly.** The Cypress original was **not** run (standing
rule: a cross-check breaks live sibling slots). So I **cannot** confirm upstream
fails identically and am **not** claiming it. What is established is that on the
CI EE uberjar the flow this test performs is not reachable through the UI.

---

## Vacuity / weakness findings

### 1. 21984's command-palette assertion is VACUOUS (upstream too) — recorded, not strengthened

`cy.findByText("Recents").should("not.exist")` inside the palette. Opening the
palette fires `GET /api/activity/recents?context=views`, and until the result is
**committed** the palette renders its empty state.

Measured with recents deliberately populated: palette reads
`"No recent items"` at t=0 and `"Recents / Reviews / Sample Database (PUBLIC)"`
from **t=200 ms** onward. So a check made the instant the palette appears passes
whatever the backend holds (FINDINGS #73). Cypress's `should("not.exist")` is
satisfied at the same instant.

**Three anchors tried, all measured insufficient:**

1. `waitForResponse` on `/api/activity/recents` — resolves at the **network**
   layer, one tick before React commits. Measured: the palette still read
   `"No recent items"` immediately after it, and the mutant survived.
2. Asserting the empty state is visible — true at t=0 in **both** cases, so
   `toBeVisible()` returns on its first poll and anchors nothing. Mutant survived.
3. Any "wait for it to settle" formulation degrades to a bare sleep, which the
   porting rules forbid.

Ported **verbatim** with the analysis inline. The home-page half of this test IS
load-bearing (mutation-killed), so the test overall is not hollow — this second
assertion is.

### 2. 53595's `isScrollableVertically` assertion is STRUCTURALLY VACUOUS on macOS — recorded, not strengthened

`expect(H.isScrollableVertically($popover[0])).to.be.false` infers "has a vertical
scrollbar" from `offsetWidth - clientWidth - borderWidth > 0`, i.e. from the
scrollbar taking **layout width**. Chromium on macOS uses **overlay** scrollbars,
which take none.

Measured on a deliberately overflowing popover (viewport height 300, filter
cleared so the full entity-type list renders):

```
overflow-y: auto, scrollHeight 650, clientHeight 147   <- plainly scrolling
offsetWidth 402, clientWidth 400, borders 1px + 1px    -> helper computes 0
isScrollableVertically -> false
```

So the assertion **cannot fail on this platform**, and neither can the Cypress
original (identical computation, same browser). It may still be live on CI's
Linux runners, where scrollbars are classic and do take width. **"Not triggered
by any failure mode I could induce"** locally.

Ported verbatim with the analysis inline. The head assertion (`"Currency"` is
visible under the `"cu"` filter) carries this test's real coverage and IS killed.

### 3. 21984's home-page assertion: a literal port is a FALSE POSITIVE — REFORMULATED (say-so)

Upstream:
`cy.findByTestId("home-page").findByText("Reviews").should("not.exist")`.

`HomeContent` (`frontend/src/metabase/home/components/HomeContent/HomeContent.tsx:50-61`)
renders **exactly one** of popular / recent / x-ray. With no recents it renders
the **x-ray** section, whose card label is the `jt`-interpolated
`A summary of <Reviews>` — the table name is its **own node**, so both
Playwright's exact `getByText` *and* testing-library's exact `findByText`
(direct child text nodes) match it. Upstream escapes only because it samples
before the x-ray candidates load; once this port anchors on the recents fetch it
lands inside that window.

Measured: **2 failures in 4 repeats**, with the backend's
`/api/activity/recents?context=views` holding **only the snapshot's three
collections** at the moment of failure — i.e. nothing was in recents and the
match was the x-ray card. (I initially misdiagnosed this as an async view-log
leak from the preceding 17768 describe and added a `waitForRecentsToExclude`
gate; the recents dump disproved that and the gate was removed. Recording the
wrong turn.)

Reformulated to upstream's **own stated intent** — its comment reads "the table
should not be in the recents results" — as: the recents section must not render
at all.

```ts
await expect(
  page.getByTestId("home-page")
      .getByText("Pick up where you left off", { exact: true }),
).toHaveCount(0);
```

Mutation-killed (opening Reviews in the QB makes the section appear). Green
32/32 under `--repeat-each=4` afterwards.

---

## Mutation testing

17 mutants. **Inputs mutated, never expectations** (except two explicitly-labelled
presence-under-mutation probes). Baseline restored byte-identical afterwards —
see "Restoration" below.

| # | Mutant (input inverted) | Result | Died at |
| --- | --- | --- | --- |
| 1 | 17768: `REVIEWS.ID` left `type/Quantity` instead of `type/PK` | **killed** | `Auto bin` absence (tail, the only assertion) |
| 2 | 18384: click `Email` not `Address` | **killed** | pathname assertion (head) |
| 3 | 18384: rename the Address field to `Street` via API | *bad mutation* | died at the **click** — the same string drives the click target and the asserted value |
| 4 | 18384: click `Email`, pathname retargeted, tail left at `Address` (**presence probe**) | **killed** | `toHaveValue` — Received `"Email"`, proving the tail reads a real element |
| 5 | 21984: `openReviewsTable` inserted *after* the data-model visit | *bad mutation* | died in the beforeEach `"ID"` gate (it navigates away) |
| 5b | 21984: `openReviewsTable` inserted *before* the data-model visit | **killed** | home-page recents assertion |
| 6 | 21984 tail probe: recents populated, home-page check relaxed | **survived** → led to vacuity finding #1 |
| 7 | 15542: FK display column `Title` → `Category` | **killed** | `"Rustic Paper Wallet"` visible (head) |
| 8 | 15542 tail: second change re-maps to `Category` | *bad mutation* | click timeout — the "Use foreign key" option isn't re-offered when already FK |
| 9 | 15542 tail: revert to "Use original value" skipped | **killed** | `"1"` visible (tail) |
| 10 | 53595: filter `"cu"` → `"zz"` | **killed** | `"Currency"` visible (head) |
| 11 | 53595 tail: empty filter, full list | **survived** → led to vacuity finding #2 |
| 12 | 55618 (table view): FK target `Reviews → ID` → `Orders → ID` | **killed** | `toHaveValue` (head) |
| 13 | 55617 (table view) tail: final semantic type set to `Quantity` | **killed** | `toHaveValue` (tail, line 573) |
| 14 | 55618 (segments detail view, post-scroll): target → `Products → ID` | **killed** | `toHaveValue` (tail) |
| 15 | 55619: seed currency `CAD` → `JPY` | **killed** | `findByDisplayValue("Canadian Dollar")` (head) |
| 16 | 55619 tail: model-metadata currency → `British Pound` | *bad mutation* | click timeout — no such option label |
| 17 | 55619 tail: model-metadata currency → `Canadian Dollar` | **killed** | tail |
| 18 | 21984 (post-reformulation): Reviews opened+run in the QB | **killed** | `"Pick up where you left off"` |

**My own bad mutations, called out**: #3 (mutated a string that drives both the
action and the assertion), #5 (inserted at the wrong point, killed the setup
gate), #8 and #16 (guessed UI option labels that don't exist — #16 twice-over the
same mistake the brief warns about for field names).

Every describe has at least one mutant that dies at its **head** and, where the
test has one, one that dies at its **tail** — except 17768 (single assertion) and
the two vacuity findings above.

## Shared state created / restored

- `resetTestTableMultiSchema()` runs only in the QA-gated 52411 `beforeEach`
  (which is now `test.fixme`, so it did not run in the final passes; it did run
  during the investigation). It creates `Domestic`/`Wild` and their tables —
  these are the **expected baseline** for `writable_db`, not new debris.
- **No foreign schema was dropped** (sibling slots are live).
- Container inventory verified afterwards: **29 schemas** —
  `Domestic, Schema A … Schema Z, Wild, public` — i.e. the #85 baseline
  unchanged, plus `Domestic.Animals`, `Wild.Animals`, `Wild.Birds` present as
  expected.
- App-DB mutations (`PUT /api/field/*`, `PUT /api/table`, `POST /api/segment`)
  are all inside `mb.restore()`-preceded `beforeEach`es; nothing leaks.
- `test-results-admdmrepro/` (my own output dir) removed. Siblings'
  `test-results*` left alone. Two temporary probe specs (`tests/zz-probe-*.spec.ts`)
  were created and deleted; none remain.

## Restoration

The spec was restored from the pristine baseline after **every** mutant (the
mutation harness `cp`s the baseline back at both ends of each run). Final state
verified byte-identical to the intended baseline:

```
MD5 (tests/admin-datamodel-reproductions.spec.ts) = 146e7133018236be4ceb895a9a4a87e2
MD5 (support/admin-datamodel-reproductions.ts)    = f9a64443bb316a9ebe4c32e409b92b92
```

(The spec's md5 differs from the pre-mutation one because of the three
*deliberate* post-mutation edits documented above — findings #1, #2 and #3 — not
because of a leftover mutant. `git status` shows only my two new files.)

## Not verified / unexplained

- The Cypress original was **not** run for any test (standing rule). Fidelity is
  therefore unconfirmed; nothing here rests on "Cypress agrees".
- Whether 52411 currently fails on master's QA-DB CI lane is **unknown**. The
  source analysis says it must; I did not observe a CI run.
- Whether finding #2 (`isScrollableVertically`) is live on CI's Linux runners is
  **unknown** — the overlay-scrollbar argument is macOS-specific and I could not
  test the Linux case.

## Summary (3 lines)

Ported 9 tests across 8 reproduction describes; 8 run and are green 32/32 under
`--repeat-each=4` on the CI uberjar (identity-verified), tsc clean, no shared
support module touched, support module named as expected.
One test is `test.fixme` as a **candidate product regression**: commit `2a6741df9cf`
widened `DataSelector.skipSteps` from `databases.length === 1` to
`enabledDatabases.length >= 1`, so the segments "Filter by table" picker now
always auto-skips the database step — measured deterministic, root-caused in
source, Cypress cross-check deliberately not run.
Mutation testing (17 mutants, 4 of them my own bad ones, all called out) killed
every load-bearing assertion and exposed two genuinely vacuous ones — the command
palette "Recents" absence and `isScrollableVertically` — both kept verbatim with
inline analysis, plus one literal-port false positive (an x-ray card's
interpolated table name) reformulated to upstream's own stated intent.
