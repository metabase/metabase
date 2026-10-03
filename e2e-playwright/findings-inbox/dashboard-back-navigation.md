# dashboard-back-navigation

Source: `e2e/test/scenarios/dashboard/dashboard-back-navigation.cy.spec.js` (512 lines)
Target: `tests/dashboard-back-navigation.spec.ts`
Support module: `support/dashboard-back-navigation.ts` — **matches the expected name, no deviation.**

## Collision checks

1. `grep -rl "dashboard-back-navigation" tests/ support/` → **no matches**. No prior port.
2. Full `e2e/test/scenarios/dashboard/` enumeration (the brief asked for the list):

   ```
   dashboard-back-navigation.cy.spec.js   <- mine
   dashboard-management.cy.spec.js
   dashboard-questions.cy.spec.js
   dashboard-reproductions.cy.spec.js
   dashboard.cy.spec.js
   tabs.cy.spec.js
   text-cards.cy.spec.js
   title-drill.cy.spec.js
   x-rays.cy.spec.js
   visualizer/            (dir — 10 .cy.spec.ts files, all already ported)
   ```

   **No `.js`/`.ts` same-basename sibling** for my source: `find e2e -iname "*back-navigation*"`
   returns exactly one file, and `e2e/test-component/` has none. The only `.ts` specs in the
   directory are under `visualizer/`, which are separate specs with separate landed ports.
   So no `-js` suffix is needed; the plain target name is correct.
3. `ls tests/` confirmed no `dashboard-back-navigation.spec.ts` existed.

## Infra tier, per describe — with the gate-OFF control

| describe | snapshot | tier | gate |
|---|---|---|---|
| #1 (8 tests) | `default` | bare jar | none |
| #2 (2 tests) | `postgres-12` | QA Postgres12 container | `PW_QA_DB_ENABLED` |

**Gate-ON:** 10 passed. **Gate-OFF control:** 8 passed, **2 skipped** (not 2 failed — there is
no `afterEach` to trip the documented teardown hazard). The gate therefore discriminates;
this is not a FINDINGS #49 "green run that never executed".

`PG_DB_ID = 2` is **not** the #85 red herring in the dangerous direction: the describe restores
`postgres-12`, under which database 2 is the **read-only QA Postgres12 sample**, not the writable
container. The card only calls `pg_sleep`. Nothing here can contaminate the shared writable DB,
and no foreign schemas were touched.

### The `@external` tag is honest for only ONE of the two gated tests (measured)

Repointing the slow card from db 2 to the H2 sample (db 1, no `pg_sleep`):

- `should restore a dashboard with loading cards` → **dies** at the loading-indicator assertion.
  Genuinely needs the slow Postgres query.
- `should preserve filter value ...` → **passes**. Its subject is request counts and
  filter-value preservation, which are indifferent to whether the query returns rows or errors.

The mutation demonstrably applied (its sibling died from the same constant — mutation-lie #1
ruled out), so this is **over-broad describe-level gating, not a vacuous test**: that test's own
assertions are load-bearing (see M4b). Both stay gated, matching upstream's tag. Recorded in the
spec header.

## URLs asserted, not just content

Upstream asserts only rendered content after each back-navigation — which a dashboard can satisfy
while the history stack is wrong. **Every back-navigation in the port additionally asserts
`expect(page).toHaveURL(...)`.** These are additions, never replacements; all upstream content
assertions remain. Flagged as STRENGTHENING in the spec header per the faithfulness rule.

Back navigation is by **click** throughout: upstream never calls `cy.go("back")`, so no
`page.goBack()` appears in the port. (It appears only in mutants — see below, where it turns out
to behave measurably differently.)

## Order-dependence under `--repeat-each=3`

**30/30 passed**, no order-dependence, timings stable to ~0.2s across the three passes. This
matters for this spec specifically: history/cache state is exactly the kind that leaks, and the
two gated tests leave 60s `pg_sleep` requests pending at teardown (upstream carries an explicit
"tests order matters" warning about this). No leakage observed.

## Mutation results

Backend verified **by identity**, not by env var: `version.hash 751c2a9` vs
`target/uberjar/COMMIT-ID 751c2a98` — the CI jar, despite the `(reused)` line.

| # | Mutation (input, not expectation) | Result | Died at |
|---|---|---|---|
| M1 | **Broken history stack**: enter the question by direct `goto` instead of the dashcard click path | killed | back button visible, assertion #1 |
| M1b | Re-enter the question *from the dashboard* before the final absence check | killed | **tail** `toHaveCount(0)` |
| M1c | Delete the second back-navigation click | killed | **middle** dashboard-header assertion |
| M2 | `page.goBack()` instead of the app's back control (test 5) | killed | `dashboard.requestCount` 1→**2** |
| M3 | Corrupt the text-card fixture text | killed | middle content assertion |
| M4 | Slow card repointed to H2 (db 1) | **split** — killed test B, **survived** test A | see tier section |
| M4b | `page.goBack()` in test A | killed | tail count 2→**3** |
| M5 | Second card moved out of the admin personal collection | killed | first permission assertion |
| M5b | `page.goBack()` in test 7 | killed | **tail** post-back permission assertion |
| M6 | Add the card to Tab 1 instead of Tab 2 | **my own bad mutation** | broke the flow at an earlier click (`getDashboardCard(0)` on Tab 1 is the pre-existing Orders card, so the "Orders, Count" click timed out) — never reached the assertion |
| M6b | `page.goBack()` in test 8 | **survived** | — |

**Where mutants died mattered.** M1, M5 and M3 all died at assertion #1, leaving tails unproven —
so M1b, M1c, M5b and M4b were written specifically to aim at the tail and middle assertions. All
four killed. Every assertion tier in the spec is now covered by at least one mutant.

### The surviving mutant (M6b), resolved

`page.goBack()` also restores Tab 2, so the mutant survives. **Not vacuous** — probed by asserting
the opposite under pristine conditions: `toHaveText("Tab 1")` fails with
`Received: "Tab 2"`, so the locator resolves and the assertion discriminates.

Mechanism, measured: the URL after back-navigation is
`/dashboard/10-orders-in-a-dashboard?tab=12-tab-2` — **the tab selection lives in the URL query
param**, so both the app's back control and a raw `goBack()` restore it. I could not induce a
failure mode for this assertion via the back-navigation path, and I am recording it that way
rather than calling it structurally vacuous.

### Migration dividend worth generalising

`page.goBack()` is measurably **not** equivalent to clicking the app's back control here, and it
shows up as a *request-count* difference, not a rendering one: goBack fires an extra
`GET /api/dashboard/:id` (M2: 1→2) and an extra dashcard query (M4b: 2→3), and in the permission
test the error card does not re-render at all (M5b). The brief's warning is confirmed with
numbers. Any port that silently swaps a UI back-click for `page.goBack()` will change what is
being tested — and in a caching spec it will change it in the direction that *hides* a regression.

## Notable port decisions

- **`InterceptAlias`** (support module) models all three `cy.intercept` behaviours, because this
  spec depends on all three:
  - `cy.wait("@alias")` pops **past** responses. `cy.wait("@dashboard")` right after
    `visitDashboard` is satisfied retroactively (the shared helper's dashcard-query waits
    necessarily resolve *after* the dashboard GET), so a literal `waitForResponse` deadlocks.
  - `cy.get("@alias.all")` counts **requests**, not responses. Load-bearing: in "should restore a
    dashboard with loading cards" **both** dashcard queries run `pg_sleep(60)` and neither has
    responded when `have.length 2` runs — a response counter could never reach 2. This was
    derived from the upstream semantics before the first run, not discovered by a failure.
  - Cypress globs don't cross `/`, so `GET /api/dashboard/*` deliberately does **not** match
    `/api/dashboard/:id/query_metadata`.
- **Placeholder trap avoided**: the "sleep" filter input is clicked once and then driven via
  `page.keyboard`, never re-resolved by placeholder mid-edit.
- **EditableText title** (test 6) uses the click + select-all + type + `textarea:focus` blur shape
  and is scoped to `qb-header` rather than the page-wide display-value scan (documented stale-index
  flake).
- **`saveDashboard` anchored** on `getDashboardCards` reaching 1 before saving (test 8), per the
  documented "save lands before the card-add applies" hazard.
- **`cy.icon("pencil").click()` in test 8** is ported literally as a page-wide `.first()` click.
  Worth recording because it is *not* what enters edit mode — `visitDashboardAndCreateTab({save:
  false})` has already left the dashboard in edit mode, so this click is inert in the flow. Ported
  rather than dropped (faithfulness); noted inline.
- Absence assertions are anchored on a loaded-state signal before being taken (the card-query
  response for the final back-button check; the SQL top-bar text for the native-editor check),
  never on a bare post-click count.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/` → **exit 0, zero errors**. No sibling noise was present
during my runs (the brief anticipated `tests/permissions-reproductions-js.spec.ts`; it was clean by
the time I ran). **No errors were attributable to other slots, and none to mine.**

## Cleanup / scope caveats

- `test-results-dbn/` removed; no sibling `test-results-*` dirs touched.
- No shared support module edited. `PORTED.txt` / `QUEUE.md` / `build-helper-index.mjs` untouched.
  Nothing committed. Port 4102 only.
- **No Cypress cross-check was run** (standing rule — sibling slots are live). I therefore
  **cannot** say whether the original behaves identically, and I am not implying I checked.
  All 10 tests pass on the port, so nothing here rests on a cross-check.
- Verified against the local jar (`751c2a98`) only. CI builds a merge with master; per PORTING the
  data-derived assertions are the class that could differ. The values this spec pins — `110.93`
  and `134.91` (Orders sample rows) and the x-ray card titles "Total transactions" / "Orders by
  Subtotal" — are sample-data-derived and are the ones to watch if CI disagrees.

## 3-line summary

Ported 10 tests (8 bare-jar + 2 QA-Postgres-gated) green on the CI jar, 30/30 under
`--repeat-each=3`, tsc clean; gate-OFF control shows 8 executed / 2 skipped, so the gate is real.
Eleven mutants: nine killed (four written specifically to reach tail and middle assertions after
the first three all died at assertion #1), one my own bad mutation, one survivor resolved as
non-vacuous — the tab selection lives in the URL, so no back-path mutation can break it.
Dividend: `page.goBack()` is measurably not the app's back control — it fires extra dashboard and
dashcard requests, which in a caching spec would hide exactly the regression under test.
