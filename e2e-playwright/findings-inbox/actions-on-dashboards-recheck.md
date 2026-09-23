# actions-on-dashboards — RE-CHECK (slot 3 / :4103)

Target: `tests/actions-on-dashboards.spec.ts` (33 tests, recorded in wave 11 as
"33/33 all-gated, never executed anywhere").

Jar confirmed: pid 8885 → `java -jar /Users/fraser/.../target/uberjar/metabase.jar`;
`target/uberjar/COMMIT-ID` = `751c2a98`, jar dated 2026-07-18. Backend reused
via `PW_KEEP_SLOT_BACKENDS=1`; no jar switch.

## Verdict, up front

**The wave-11 claim is RETRACTED, not narrowed.** The spec runs. With the QA
containers up it goes from **0 executed / 33 gate-skipped** to **33 executed /
0 skipped**, all green, stable, with 33 of 35 mutants killed (the 2 survivors
were bad probes of mine, re-probed and shown non-vacuous — see below).

That said, it did not run *as written*: 17 of 33 failed on the first honest
run. Those were port defects, not environment. So the wave-11 note was wrong
about the gate but right that the port was unverified — "faithful by
construction" bought about half the tests.

## The exact gate condition, and where it is evaluated

`tests/actions-on-dashboards.spec.ts:77`

```ts
const skipUnlessQaDb = () =>
  test.skip(!process.env.PW_QA_DB_ENABLED, "Requires the writable QA database …");
```

called at describe scope in three places — `:335` (inside the
`for (const dialect of ["mysql","postgres"])` loop, so it covers both dialect
describes), `:1363` (`action error handling`) and `:1424`
(`Action Parameters Mapping`). Together they cover all 33 tests.

This is **byte-for-byte the same gate `model-actions.spec.ts` uses**
(`support`-free, `test.skip` at describe scope on the same env var, declared at
`tests/model-actions.spec.ts:160`). I checked this rather than assuming it,
because the brief warned not to. There is no second precondition anywhere in
the spec — no snapshot probe, no container reachability check, no token gate.

So the wave-11 "all-gated" result was **entirely** environmental: the note
itself says "Neither QA container is reachable locally (postgres :5404 and
mysql :3304 both down)". Containers up ⇒ `PW_QA_DB_ENABLED=1` ⇒ everything
runs. The generalisation that `@external`+`@actions` specs cannot run in this
harness never had a mechanism behind it; it was one bad afternoon of Docker.

Container evidence at the time of this run: `metabase-e2e-postgres-sample-1`
(:5404), `metabase-e2e-mysql-sample-1` (:3304), `metabase-e2e-mongo-sample-1`,
`metabase-e2e-maildev-1`, `metabase-e2e-webhook-tester-1`. `writable_db`
present on both SQL containers. No foreign schemas dropped (#85): the spec's
`resetTestTable` only drops/recreates `public.scoreboard_actions` and
`public.many_data_types`, both of which this spec owns.

## Executed vs skipped

| run | result |
|---|---|
| gate ON, first run, spec unmodified | **16 passed, 17 failed** (7.0m) |
| gate ON, after fixes | **33 passed, 0 skipped, 0 failed** (1.9m) |
| gate ON, `--repeat-each=2` ×4 runs | 66/66 three times; **one run had 2 failures** (see "Unexplained") |
| gate OFF (no `PW_QA_DB_ENABLED`) | **33 skipped, 0 failed** — control confirms the gate still closes correctly |
| `bunx tsc --noEmit` | clean for this spec (the one repo error is a sibling's `tests/actions-reproductions.spec.ts`) |

**Runs must set `TZ=US/Pacific`** — the harness/CI convention already documented
in `support/binning-time-series.ts` and `support/dashboard-filters-date.ts`, and
set in `.github/workflows/e2e-playwright.yml`. See fix 6; on a UTC+13 machine
the date/time test fails for a real reason and upstream Cypress would fail the
same way.

## The 17 failures, and what each actually was

All six are port defects. None was a product bug; no product-bug claim is made.

### 1. Wrong intercept predicate — `@getActions` vs `@getModelActions` (7 tests)

Upstream registers **two** action intercepts:

```js
cy.intercept("GET", "/api/action").as("getActions");
cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");
```

and every `cy.visit("/model/:id/detail")` waits on `["@getModel",
"@getModelActions"]`. The port had one predicate, `isActionList`, which
*excludes* `model-id` — correct for `@getActions` (Cypress's glob does not match
a query string), wrong for all five `@getModelActions` sites. The model-detail
page only ever fires the `?model-id=` form, so `waitForResponse` sat there for
30s. Added `isGetModelActions` and pointed `:335 :372 :682 :760 :1414` at it.

Note this is the *inverse* of the `model-actions` finding: there the hazard was
`cy.wait` popping a **past** response; here it was a predicate that could never
match at all. Both are "the alias is not the thing you think it is".

### 2. `openFieldSettings` was page-wide when upstream is container-scoped (2 tests)

Upstream always calls it inside `formFieldContainer(…).within()`, so its
`cy.icon("gear")` sees exactly one gear. The port took a `Page` and called
`openFieldSettings(currentStatus.page())` — hoisting straight back out to the
document. Strict-mode violation on four gears (one "Action settings" plus one
per field). Changed the signature to take a `Locator` scope. Textbook
unpinned-locator defect.

### 3. Field-type radios silently un-check each other (4 tests) — the expensive one

Upstream: `cy.findAllByText("Number").each(el => cy.wrap(el).click())`.

Measured behaviour on this jar: clicking field 0's "Number" radio latches it;
clicking field 1's "Number" radio then **un-checks field 0 again**
(`isChecked()` → `false`, still false a second later). The action was therefore
created with the `id` template tag still typed `text`, and postgres rejected the
write:

```
ERROR: operator does not exist: integer = character varying   (POST …/execute → 500)
```

The test's only symptom was `expect(after.rows[0].score).toBe(55)` →
**Received: 0**, ~200 lines from the cause. This is exactly the failure shape
the brief warns about — it reads as "the write is broken" when the real story
is a form-state race. I only found it by dumping the 500 body and the created
action's `visualization_settings`.

Fix: `setAllFieldTypesToNumber()` re-clicks any unchecked radio until **all**
are simultaneously checked (`expect(...).toPass`). Cypress's command queue
paces the clicks enough to avoid the race; this is a synchronisation, not an
assertion change. **The clobber mechanism itself is NOT diagnosed.** I did not
open the FormFieldEditor state flow; I am recording the observation, not a
theory about it.

### 4. `fill()` on `datetime-local` with zero seconds → "Malformed value" (2 tests)

Chrome normalises `"2020-05-01T16:45:00"` back to `"2020-05-01T16:45"`, and
Playwright's `fill()` rejects its own read-back. Upstream `.type()`s the same
string and Chrome silently drops the `:00`. Trimmed to minute precision — same
instant, and the read-backs only assert the date part. Values with **non-zero**
seconds (`01:35:55` in the date/time test) need no trim, which is why only two
of the datetime fills failed.

### 5. The pencil icon does not respond to a real mouse click (2 tests)

`icon(getActionParametersInputModal(page), "pencil").click()` reports success
and the action editor never opens. Measured:

- `document.elementFromPoint` at the icon's centre resolves to **the icon
  itself** (`same: true`) — no overlay, no tooltip in the way. So this is *not*
  the Mantine-Tooltip hit-testing pattern from the Chrome-upgrade notes.
- `dispatchEvent("click")` — which is what Cypress's `.click()` sends — opens it
  immediately.

**Mechanism unexplained.** Recorded as observed behaviour. `openActionEditor()`
uses `dispatchEvent` with the reason written inline.

Second-order trap found while fixing it: asserting `expect(actionEditorModal)
.toBeVisible()` fails — the **Mantine `Modal` root element reports `hidden` to
Playwright while the modal is open and fully interactive**. Assert on the
content (`…getByTestId("action-creator")`) instead. Worth promoting: any port
that waits on a Mantine Modal root rather than its contents will hang.

### 6. `queryWritableDB` does not JSON-serialise, so date columns read differently than under Cypress (3 tests)

`cy.task()` returns over the Cypress IPC bridge, which **JSON-encodes** the
result — a postgres `date`/`timestamp` reaches the upstream spec as an ISO-8601
*string*. That is why upstream can write
`expect(row.date).to.include("2020-01-10")` (and why it has the comment "the
driver adds a time to this date so we have to use `.include`").

`queryWritableDB` talks to knex directly and hands back the raw driver value —
a JS `Date`, whose `String()` form is `"Fri Jan 10 2020 00:00:00 GMT+1300"` and
contains no ISO date at all. The port's `String(row.date)` could never match,
in any timezone.

Fixed **in the spec**, not in the shared helper: `asCypressRow()` does a
`JSON.parse(JSON.stringify(row))` round-trip, reproducing exactly what Cypress
sees. I deliberately did **not** change `support/actions-on-dashboards.ts` —
`queryWritableDB` is imported by `model-actions`, `question-reproductions`,
`embedding-hub`, `table-editing` and others, and silently turning their Dates
into strings is not a change I can re-verify from here. **Flagging it as a
consolidation candidate**: the faithful shape is for `queryWritableDB` itself to
mirror cy.task's serialisation, and every caller that compares a temporal column
is latently exposed until it does.

Consequence: like upstream, the assertions are timezone-sensitive (a JS Date at
local midnight only serialises to the same calendar day when the zone is behind
UTC). `TZ=US/Pacific` is required — CI already sets it.

## Mutation testing

35 mutants across two batches, plus two follow-up liveness probes. Every
mutation inverts an **input**; no expectation was weakened.

### Batch A — write-path neuters (16 targeted, **16 killed**)

| # | Mutation | Tests hit | Result |
|---|---|---|---|
| **A1** | **Neuter the write**: `WHERE id = {{ id }}` → `… AND 1 = 0` in both typed-SQL query actions (kept `{{ new_score }}` so the form is unchanged) | custom-query-action, hidden-fields query action, ×2 dialects | **4 killed**, `Expected 55, Received 0` |
| A2 | implicit create: `Score` 44 → 45 | create + hidden-fields implicit, ×2 | 4 killed, `Expected 44, Received 45` |
| A3 | implicit update: `Score` 88 → 89 | update ×2 | 2 killed |
| A4 | implicit delete: `ID` 3 → 4 (deletes the wrong row) | delete ×2 | 2 killed, `Expected 0, Received 1` |
| A5 | data types update: `Integer` 123 → 124 | ×2 | 2 killed |
| A6 | data types insert: `Integer` -20 → -21 | ×2 | 2 killed |

**Neuter-the-write verdict: the read-backs are genuinely wired to the
database.** A1 alone takes down 4 tests, and A2–A6 cover the implicit
create/update/delete and many-data-types write paths A1 cannot reach. Every
write-asserting test in the spec dies to at least one of these, on both
dialects.

### Batch B — UI, absence and ordering (19 targeted, **17 killed**)

| # | Mutation | Result |
|---|---|---|
| B1 | date/time: mutate **only** the `Date` input to `2020-03-15`, leaving `newTime` for the assertions | killed ×2 |
| B2 | hidden fields implicit: drop `hideField: "Created At"` | killed ×2 (the `Created At` absence check is load-bearing) |
| B3 | hidden fields query action: skip `toggleFieldVisibility(currentStatus)` | killed ×2 (the `Current Status` absence check is load-bearing) |
| B4 | data types: point the JSON-absence check at `UUID` (which exists) | killed ×2 — the absence locator resolves real widgets |
| B5 | WRK-67: delete the outside-click | killed ×2 |
| B6 | edit-title: type `"Some other name"` | killed ×2 |
| B7 | edit-query: send `ID` 2 instead of 1 | killed ×2 |
| B8 | constraint violation: use a team name that does **not** already exist | killed |
| B9 | refetch (#33084): keep the filter at 5 instead of switching to 10 | killed |
| B10 | mapping form: skip `toggleFieldVisibility("New Score")` | killed |

**Important negative result on my own method:** the naive date/time mutation —
changing the shared `newTime` constant — **survives**, because the assertions
are written as `toContain(newTime.slice(0,10))` and move with it. A mutation
that edits a value used by *both* the input and the expectation proves nothing.
B1 exists because of that; it mutates the input alone.

### The two Batch-B survivors were bad probes, not vacuous assertions

`hide actions in public dashboards` / `hide actions in static embed dashboards`
have no input to flip (the product decides), so I probed the locator instead:
re-pointed `getByRole("main").getByText(…).toHaveCount(0)` at text I expected to
be present. Both survived — twice, first with `"Powered by Metabase"`, then with
the dashboard name. Neither is inside `<main>`, so both probes were simply
wrong.

Resolved by measurement rather than by assumption:

```
DEBUG regular   main>Create 1        ← same locator, normal dashboard
DEBUG public    mainCount 1  createAnywhere 0
DEBUG embed     mainCount 1  createAnywhere 0
```

`<main>` exists on both the public and the embedded dashboard, and the **exact
same locator** returns 1 on the ordinary dashboard and 0 on the public one. The
absence assertions are non-vacuous. (Aside: had `<main>` been missing, Cypress's
`findByRole` would have thrown while Playwright's `toHaveCount(0)` would have
passed silently — worth remembering as a general port hazard, even though it
did not bite here.)

## Unexplained / recorded, not diagnosed

1. **One `--repeat-each=2` run had `Write Actions (postgres) › adds a custom
   query action` fail on both repeats**, after all fixes were in. The same test
   then passed 6/6 in isolation and the full `--repeat-each=2` passed 66/66 on
   the three subsequent runs, plus two clean full 33-test runs. I did not
   capture the error text for that run and cannot say what it was. Recording it
   as an observed, unreproduced intermittent rather than inventing a cause. If
   it recurs, that test's `setAllFieldTypesToNumber` convergence loop is the
   first thing to instrument — it is the newest and least understood code in
   the spec.
2. **Why a real mouse click on the action-parameters pencil does not fire
   React's onClick** (fix 5). Hit-testing ruled out; nothing else investigated.
3. **Why field 0's "Number" radio un-checks when field 1's is clicked**
   (fix 3). Reproducible and now worked around; mechanism not opened up.

## Things I did NOT do

- No Cypress cross-check (standing rule).
- No edit to any shared support module. `support/actions-on-dashboards.ts` is
  untouched despite fix 6 arguably belonging there — reasoning above.
- `getTableId` remains unpinned in the shared module; still safe
  (`scoreboard_actions` and `many_data_types` are `public`-only) and still
  latent. Not my call to change here.
- No `test.fixme`, no skipped test, no weakened assertion.

## Summary (3 lines)

1. The wave-11 "33/33 all-gated" record should be **retracted**: the gate is
   nothing but `PW_QA_DB_ENABLED` (`:77`, three describe-scope call sites,
   identical to `model-actions`), it was closed only because the QA containers
   were down, and with them up the spec goes to **33 executed / 0 skipped, all
   green**, stable across four `--repeat-each=2` runs, with a clean gate-OFF
   control at 33 skipped / 0 failed.
2. It did not run as written — **17 of 33 failed first time** on six real port
   defects: the wrong `/api/action` predicate (`model-id` missing), a
   page-wide `openFieldSettings`, a form-state race that left a template tag
   typed `text` and surfaced 200 lines later as `Received: 0`, `fill()` on
   zero-second `datetime-local`, a pencil icon that ignores real mouse clicks,
   and `queryWritableDB` not JSON-serialising the way `cy.task` does.
3. **33 of 35 mutants killed**, including a neuter-the-write probe that takes
   down 4 tests and per-path probes covering every implicit create/update/delete
   and data-type write; the 2 survivors were my own mis-aimed liveness probes,
   re-measured to show the public/embed absence assertions are load-bearing.
   Three things remain **unexplained and are labelled as such**, including one
   unreproduced double-failure of a single postgres test.
