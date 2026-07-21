# Migration dividends — defects found in the EXISTING Cypress suite

Every entry here is a problem in the **current** e2e suite, surfaced by porting
it. None of these are Playwright bugs or porting artifacts; they are things the
Cypress suite believes it is testing and isn't.

This is the strongest argument for the migration, so it has to survive scrutiny.
Two rules for this file:

1. **Nothing enters without a finding number and a measurement.** No "looks
   vacuous" — either a mutation killed it or it didn't.
2. **Every entry carries an honest "does it bite?" column.** A latent hole that
   convention covers is not the same as active missing coverage, and conflating
   them would discredit the list. #218 is the worked example: I first called a
   helper "the primary evidence across the sandboxing specs", then measured and
   found 13 of its 14 call sites already guarded. That correction is in the
   record, and this file states the scoped version.

Counts below are what was measured, not estimates.

---

## 1. Assertions that CANNOT fail

The largest class. These pass regardless of product behaviour.

| # | What | Bites? |
| --- | --- | --- |
| **#73** | **All 8 absence assertions in `custom-elements-api` were vacuous upstream** — satisfied before the page painted | **Yes** — the whole spec |
| **#76** | A test whose **entire subject can be deleted** without turning it red | **Yes** |
| **#77** | Upstream's CSV assertions **inspect the wrong bytes** (`sdk-csv-downloads`) | **Yes** |
| **#20** | Vacuous 403 assertion across an **18-invocation permission matrix** | **Yes** — security surface |
| **#132** | Invalid-file "no table created" check: `tableName` is `undefined`, so the query is `LIKE '%undefined_%'` and can never match | **Yes** |
| **#165** | `#15170`: `semantic_type type/PK` and the dashcard `parameter_mappings` target are both non-load-bearing — **~2/3 of the test body does nothing** | **Yes** |
| **#202** | `rowsShouldContainOnlyOneCategory` **passes on an empty result set** (`[].every(...)` is `true`) | **Yes** |
| **#206** | `cy.icon("gear").should("not.exist")` — `.Icon-gear` **matches nothing anywhere**, including as admin | **Yes** |
| **#127** | `should("have.value", "on")` on a checkbox — `"on"` is the HTML default and doesn't track checkedness | **Yes** |
| **#83** | `should("be.empty")` on an `<input>` | **Yes** |
| **#182** | `transforms-indexes` row-0 `contain "name"` — the Name cell already reads `idx_animal_name` | **Yes** |
| **#114** | Command-palette "Recents" absence check — the empty state renders until the fetch commits at ~200ms | **Yes** |
| **#218** | `assertDatasetReqIsSandboxed`'s `values.every(...)` passes on zero rows | **Latent** — 13 of 14 call sites carry an adjacent row-count guard; **1 exposed** (`notebook-link-to-data-source.cy.spec.ts:530`) |
| **#92 / #115** | `isScrollableHorizontally` / `Vertically` infer a scrollbar from layout width; Chromium's overlay scrollbars consume none. Measured `scrollHeight 650` vs `clientHeight 147` still returning `false` | **Platform-dependent** — vacuous on macOS, unresolved on Linux CI |
| **#189** | `alert-types`: the test named *"should not be possible to create goal based alert for a multi-series question"* **never reaches the guard it names** — its fixture sets no `visualization_settings` | **Yes** |

## 2. Tests with no assertion at all

| # | What |
| --- | --- |
| **#63** | `data-studio-library`: a test with **no assertion whatsoever** |
| **#35** | `documents`: a dead test (`"should support formatting via …"`) |
| **#175** | `#68378` ends on a Save click with **no assertion**; `GDGT-1776` checks `loading-indicator` absence **before** its positive anchor |
| **#37** | `click-behavior`: **callback-scoped assertions never enforce** |

## 3. Tests asserting behaviour that no longer exists

| # | What |
| --- | --- |
| **#158** | `dependency-checks` tests a flow **deleted from the product**. `d8b40292d12` ("Disable blocking dependency checks on save", #70819) unregistered the hooks and **deleted 145 lines from that very spec** — the 4 survivors are the negative half of a pair whose positive half is gone. A follow-up removed the components and the `check-card`/`check-transform`/`check-snippet` endpoints |

## 4. Silent skips — "green" runs that executed nothing

| # | What | Scale |
| --- | --- | --- |
| **#67** | maildev 3.x **silently disables every email test** — a green run that never ran | whole email tier |
| **#49** | The ported-but-never-executed tier, quantified rather than assumed | — |
| **#123** | **~20 of ~50** specs restoring a `*-writable` snapshot carry **no `@external` tag** — "untagged" does not mean "needs no container" | ~40% of that tier |
| **#120 / #149** | Tags that are *accurate* but over-broad: `sandboxing-via-ui` restores `postgres-12` yet only touches db 1 — `restore("default")` passes all 18. **18 tests gated for nothing** | 18 + 6 more |

## 5. Races and ordering that upstream survives by luck

| # | What |
| --- | --- |
| **#168** | Four "navigate away and back" persistence assertions did not verify persistence — the name input settles **before** the selects. **Cypress retries identically, so upstream shares the race** |
| **#187** | Upstream's comment *"all tests can run independently"* is **false as written** — the unsubscribe test destroys the recipient test's precondition |
| **#196** | `waitForSyncToFinish` is very nearly a bare `cy.wait(500)`: `initial_sync_status` is a **first-ever-sync** marker, already true by the time the test body calls it. **Upstream is racing the sync** |
| **#26** | Latent upstream flake source in `schema-viewer`, made explicit |
| **#164** | An assertion **subsumed by its successor** — `contain.text "transform_table"` then `"mb__isolation/__transform_table"`; the first can never fail independently |
| **#16** | Cypress wait-ordering quirk (`question-new`) |

## 6. Fixture and hygiene defects

| # | What |
| --- | --- |
| **#101** | The `Schema A…Z` container debris is **self-inflicted** — `issue 28106` inside `notebook-data-source` creates `many_schemas` and never cleans up, so the spec contaminates itself across runs |
| **#195** | **Model persistence leaks a `metabase_cache_*` schema per run, forever** — `unpersist` only *marks for pruning* and the name hashes the site-uuid. Real upstream; invisible there only because CI containers are ephemeral |
| **#132b** | `uploads`' permissions/cleanup describes **create tables in the read-only QA `sample` database and never clean up** |
| **#156** | Upstream's `transform_table` literal collides with a live sibling fixture and sits inside `transforms.spec.ts`'s `%transform%` DROP sweep |

## 7. Product findings (not test defects)

| # | What |
| --- | --- |
| **#113 / #151** | **PR #64406** widened `DataSelector.skipSteps` from `databases.length === 1` to `enabledDatabases.length >= 1`, so with two databases the DATABASE step is **always skipped**. **Three agents derived this independently from three specs with three different symptoms**; the third measured the window directly (nothing selected at +159ms, auto-selected and PUT at +280ms — ~150ms). Seven tests are `test.fixme` because their subject is now untestable. **Not claimed:** whether Cypress catches it — the cross-check was barred |
| **#126** | `?ssl=false` in a connection string turns the SSL switch **on** — the raw string goes into `details.ssl` and `"false"` is truthy. **Scoped to the form layer only**; the saved record was not checked |
| **#134** | `UndoListing.tsx:203` is `"Cypress" in window ? MockGroup : TransitionGroup` — **toast exit transitions are disabled only under Cypress**. The app behaves differently *because* Cypress is the runner, so upstream's green is not evidence about anything else |

---

## What this does and does not support

**Supports:** the porting process is a systematic audit that the suite has never
had. Mutation testing every port is what surfaced most of section 1 — a green
test proves nothing until something that should break it does, and roughly a
dozen assertions turned out to be incapable of failing.

**Does not support:** "the Cypress suite is broken". Most of these are
individual assertions inside tests that also contain load-bearing ones (#218 is
the clearest case: 13 of 14 sites covered by convention). The suite works; it
has a measurable tail of assertions that don't.

**The honest one-line version:** porting 414 specs with mutation testing found
~30 defects in the existing suite, of which roughly half would let a real
regression through today.
