# sandboxing-via-ui — port report (slot 2, port 4102)

Source: `e2e/test/scenarios/permissions/sandboxing/sandboxing-via-ui.cy.spec.ts` (364 lines)
+ the parts of `helpers/e2e-sandboxing-helpers.ts` it uses (649 lines).
Target: `e2e-playwright/tests/sandboxing-via-ui.spec.ts` (18 tests, all green).
Support module: **`support/sandboxing-via-ui.ts`** — the expected name; no deviation.

Backend verified BY IDENTITY, not `JAR_PATH`: `ps -o command= -p 24760` shows
`-jar /Users/fraser/.../target/uberjar/metabase.jar`, and
`/api/session/properties` → `version.hash = 751c2a9` vs `target/uberjar/COMMIT-ID
= 751c2a98`. Jar mode throughout.

## Collision checks

- `grep -rl "sandboxing-via-ui" tests/ support/` → **no hits** (exit 1). No
  existing port of my source. Not blocked.
- `ls tests/ support/`: `sandboxing-via-api.spec.ts` + `support/sandboxing-via-api.ts`
  exist (read only, never edited); `permissions-reproductions{,-js}` exist.
- ⚠️ **Brief correction:** the brief said `sandboxing-misconfiguration` and
  `impersonated` already exist as ports. They do **not** — `tests/` contains no
  `sandboxing-misconfiguration.spec.ts` and no `impersonated.spec.ts`. Only
  `sandboxing-via-api` is present from that cluster. No consequence for me, but
  the brief's collision list is stale in the permissive direction.
- I deliberately **inlined** my own `createUserFromRawData` rather than importing
  the one in `support/sandboxing-via-api.ts`, because that module's green is
  marked UNVERIFIED and a sibling may be editing it live. My spec's setup cannot
  be changed underneath it.

## `signInWithCredentials` — I did NOT use it, and here is the proof why

**I did not use `signInWithCredentials`.** I first reproduced the harness bug the
brief describes, then built around it. Both probes ran on slot 2 / jar 751c2a9.

Probe 1 — the bug, confirmed exactly as briefed:

```
[WHO] admin before                        : admin@metabase.test
[WHO] returned userApi                    : s2probe@example.com
[WHO] mb.api AFTER signInWithCredentials  : s2probe@example.com   ← contaminated
[WHO] mb.api after mb.signInAsAdmin()     : s2probe@example.com   ← NOT undone
[WHO] browser after signInAsAdmin         : admin@metabase.test   ← browser IS admin
```

So the divergence is **API-vs-browser**: `mb.signInAsAdmin()` fixes the browser
and silently fails to fix `mb.api`. Cause is as briefed — the `POST /api/session`
goes through `mb.api`'s `APIRequestContext`, the `Set-Cookie` lands in that
context's jar, and `wrap-session-key` resolves cookie before header, so the
header `signInAsAdmin` rewrites is ignored.

Probe 2 — my fix, isolated in a clean test (probe 1's last arm was contaminated
by its own earlier call; I re-ran it standalone rather than reporting the
contaminated reading):

```
[WHO] cleanApi (throwaway-context login)  : s2probe@example.com
[WHO] mb.api after that login             : admin@metabase.test  ← jar stays clean
[WHO] browser                             : s2probe@example.com
[WHO] mb.api after browser switched       : admin@metabase.test
```

`support/sandboxing-via-ui.ts signInAs()` therefore does the session POST through
a **throwaway `playwrightRequest.newContext()` which is disposed immediately**,
sets the browser cookies explicitly, and returns a `MetabaseApi` bound to the new
session id. `mb.api` is never touched and stays admin.

**Which user each later API call ran as, per call site:** every helper takes its
`api` explicitly, and I added `assertRunningAs(api, email)` (a `GET
/api/user/current` equality check) at each of the 8 sign-in points in the spec
plus one on `mb.api` in the admin `beforeEach`. Those assertions run in the green
suite, so the green run itself is the standing proof. See M5 below for the
measurement that they are load-bearing rather than decorative.

**The shared fix is still owed** and I did not apply it — agents are live.

## Gate mapping, with the gate-OFF control

| Gate | Upstream | Port | Control |
|---|---|---|---|
| `@external` (suite-level `{ tags: "@external" }`) | `H.restore("postgres-12")` in `before` | `test.skip(!PW_QA_DB_ENABLED)` | **ON: 18 executed, 18 passed. OFF: 18 skipped, 0 executed.** Difference is exactly the 18 gated tests — the whole file, matching the suite-level tag. |
| Token | `H.activateToken("pro-self-hosted")` | `test.skip(!resolveToken("pro-self-hosted"))` + `mb.api.activateToken("pro-self-hosted")` | see predicate trace below |

### 🔴 The `@external` tag is a RED HERRING — measured

The spec restores `postgres-12` but **never touches database 2**. Every code path
uses `databaseId: 1`, `tableName: "Products"`, and the sample-DB `PEOPLE` table.

Experiment G1: swapped `restore("postgres-12")` → `restore("default")`, changing
nothing else. **All 18 tests pass (1.0m).** The QA postgres database is dead
setup here.

Consequence: dropping the tag would recover 18 tests on every non-QA-DB CI leg.
**I did not act on it** — faithfulness. The port keeps `restore("postgres-12")`
and keeps the `PW_QA_DB_ENABLED` gate, so it behaves exactly like upstream. This
is recorded as an upstream observation for someone to action deliberately.
(Scope caveat: I verified the *tests* pass; I did not audit whether the
postgres-12 snapshot differs from default in some way CI depends on for
ordering.)

### Token predicate — traced, and the answer is a hard feature gate

Not a `(not is-hosted?)` short-circuit (#106), not split-by-argument (#136), and
**BE and FE agree** (no #-style disagreement). It is the #124 family: a hard
`defenterprise ... :feature :sandboxes` gate.

- `enterprise/backend/src/metabase_enterprise/sandbox/models/sandbox.clj:172-176`
  — `(defenterprise upsert-sandboxes! ... :feature :sandboxes ...)`. That is the
  write path this entire spec depends on.
- `src/metabase/premium_features/token_check.clj:690` —
  `(assert-has-feature :sandboxes (tru "Sandboxing"))` → `ee-feature-error` → 402.
- `has-feature?` is just `(contains? (*token-features*) "sandboxes")` (token_check.clj:663-668).

Measured on slot 2 (token values never printed):

```
with pro-self-hosted token : sandboxes=true  advanced_permissions=true  featuresOn=42
  PUT /api/permissions/graph with a sandbox      -> 200
token cleared              : sandboxes=false advanced_permissions=false featuresOn=0
  PUT /api/permissions/graph with a sandbox      -> 402
      "Sandboxes is a paid feature not currently available to your instance."
  FE: "Row and column security" option on the admin page -> count 0 (not rendered)
```

So the local `pro-self-hosted` token really is the **42-feature** one the brief
names, and it **has** both `sandboxes` and `advanced_permissions` — verified, not
assumed. (Note: before my spec ran, `/api/session/properties` on this backend
read 53/59 features ON — leftover state from a prior session's *different*
token, not a property of `pro-self-hosted`. I mention it because a naive reading
of that number would have been wrong.) The brief's retraction of the
"`.env` trailing comma" advice held up: tokens read clean from `cypress.env.json`
via `support/env.ts`, activation succeeded, nothing read `ON (0)`.

Instance state restored after this probe (see bottom).

## Every fixture id and where it came from

**No id was guessed or typed from memory.** All table/field ids are destructured
from `SAMPLE_DATABASE`, which `support/sample-data.ts` imports from the generated
`e2e/support/cypress_sample_database.json` at import time:

| id | value on this box | read from |
|---|---|---|
| `PRODUCTS_ID` | 7 | `cypress_sample_database.json` |
| `ORDERS_ID` | 5 | `cypress_sample_database.json` |
| `PEOPLE_ID` | 6 | `cypress_sample_database.json` |
| `PRODUCTS.CATEGORY` | 61 | `cypress_sample_database.json` |
| `PRODUCTS.ID` | 58 | `cypress_sample_database.json` |
| `PEOPLE.STATE` | 52 | `cypress_sample_database.json` |
| `ORDERS.PRODUCT_ID` / `.TOTAL` / `.ID` | 38 / 41 / 36 | `cypress_sample_database.json` |
| `SAMPLE_DB_ID` | 1 | `support/sample-data.ts` |

`USER_GROUPS` is **not** generated fixture data — upstream it is a hand-written
literal map (`e2e/support/cypress_data.js:42-49`). I read that file directly
rather than copying the sibling module's values, and mirrored:
`ALL_USERS_GROUP=1, ADMIN_GROUP=2, COLLECTION_GROUP=5, DATA_GROUP=6, READONLY_GROUP=7`.

Because they are mirrored literals, I added **`assertUserGroupIds()`**, which runs
in setup and cross-checks all five against `GET /api/permissions/group` by name.
A drifted id now fails loudly instead of silently sandboxing the wrong group.
This directly addresses the brief's `MAGIC_USER_GROUPS` trap: `DATA_ANALYSTS_GROUP`
is **4**, in the separate `MAGIC_USER_GROUPS` map (`cypress_data.js:51-54`); the
group this spec needs is `DATA_GROUP` = **6**. Documented inline at the constant.

No `ORDERS_QUESTION_ID` / `ORDERS_DASHBOARD_ID` are used by this spec.

The fixture built by setup was verified against the live instance rather than
assumed: collection "Sandboxing" (id 17) contains exactly **10** items — 1
dashboard + 9 sandboxable questions/models — and the 2 custom views correctly
land in **root**, not Sandboxing (see "faithfulness notes").

## Mutation testing

Every mutation was applied with an anchored `python3` replace carrying a
`assert s.count(old) == 1`, then the file was read back and the marker grepped
before running. No silent clobbering.

| # | Mutation | Result | Where it died |
|---|---|---|---|
| **M1** | **Remove the sandbox** from "filtered by a regular column" | **KILLED** | `is_sandboxed` expected true, got false |
| **M1b** | M1 **+ disable the `is_sandboxed` proxy**, to test the tail | **KILLED** | row content: "Every result should have have a Gizmo in: Question showing all products" |
| **M2** | Invert test 1's *input*: apply a sandbox before asserting none is applied | **KILLED** | "Results are not sandboxed" expected false, got true |
| **M3** | Remove the sandbox from all 12 custom-column tests | **SURVIVED** ×12 | — see analysis |
| **M4** | Never configure the column/attribute sandbox in "filter values are sandboxed" | **KILLED** | `caPopover.getByLabel("WA")` expected 0, got 1 — the CA user could see WA |
| **M5** | Simulate the harness footgun: API calls run as **admin**, `assertRunningAs` removed | **SURVIVED** | — the silent-vacuity shape, see below |
| **M5b** | M5 with `assertRunningAs` restored | **KILLED** | "API calls should be running as alice@gizmos.com" — got `admin@metabase.test` |
| **M5c** | M5's admin leak applied to a *sandboxed-direction* test | **KILLED** | `is_sandboxed` expected true, got false |

### The decisive mutation (M1 / M1b): two independent proxies

Removing the sandbox kills at `is_sandboxed`, **and** — with `is_sandboxed`
separately disabled — kills again at the row-category check. That is the
`permissions-reproductions-js` standard the brief asked for: two independent
observations of the restriction, not one. `is_sandboxed` alone is only the QP
self-reporting that a sandbox ran (FINDINGS #87); the row-content proxy is the
one that observes data actually being filtered, and it fires.

### M3 survived — and it is **data insufficiency, not vacuity**

All 12 custom-column tests pass with the sandbox removed entirely. A presence
probe settles which of the two it is:

```
[PROBE] products per category: [["Doohickey",42],["Gadget",53],["Gizmo",51],["Widget",54]]
[PROBE] SANDBOXED: is_sandboxed=true rows=20
[PROBE] SANDBOXED categories seen: ["Gizmo"]
```

The sandbox **is** genuinely applied and genuinely filtering (only Gizmo rows come
back, `is_sandboxed=true`). But the base query carries `limit: 20`, and every
category has more than 20 products (min 42), so the assertion the test makes —
`"20 rows"` on both dashcards — returns **20 in both branches**. The assertion is
structurally incapable of distinguishing sandboxed from unsandboxed.

This is the brief's "a surviving mutation is not automatically vacuity" case, and
the presence probe is what separates them. **Ported verbatim, not strengthened**,
because upstream's intent is not unambiguous in the restriction direction: the
describe is titled *"should work when applying a sandbox policy…"* and carries the
comment *"Custom columns currently DO work"* — i.e. the intent plausibly **is**
"a sandbox whose custom view has custom columns renders without erroring", which
is exactly what the test does verify. Recorded rather than silently changed.

### M5 is the finding that justifies the one thing I strengthened

M5 is the harness footgun made concrete: with the sandboxed user's API calls
silently executing as **admin**, and no guard, the test **passes green** while
measuring nothing about the sandboxed user. M5b shows `assertRunningAs` catches
it. M5c bounds the blast radius: the vacuity is **one-directional** — an admin
leak silently passes only the two `assertNoResultsOrValuesAreSandboxed` tests, and
fails loudly on every sandboxed-direction test (admin gets `is_sandboxed=false`).

So the two "shows all data before sandboxing policy is applied" tests were exactly
the ones at risk, and they are the ones the guard protects.

### Bad mutations I ran — called out

- My **first auth probe was self-contaminating**: I tested the throwaway-context
  login *after* an earlier `signInWithCredentials` in the same test had already
  poisoned the shared jar, so the clean arm read as contaminated and looked like
  the fix didn't work. The reading was worthless. I re-ran it standalone; only
  the isolated result is reported above.
- I initially accepted an **8.3s green** on the first test as a pass. That is not
  a plausible duration for a build that creates 10 cards and drives a 6-column
  CodeMirror notebook flow, so I instrumented rather than trusting it. The build
  is genuinely real (`BUILD START`→`BUILD END` = 5.7s, `questions=9 dashboard=11`)
  and independently corroborated against the live instance (collection 17 has all
  10 items including "Model with custom columns", which only exists if the UI
  notebook flow ran). The jar on local H2 is simply fast. Recording this because
  "suspiciously fast green" was the right instinct and the wrong conclusion.

## What I strengthened, and why (declared)

One addition, `assertRunningAs()`, called at 9 points. It is **not** in upstream.

Justification: Cypress gets "the API calls run as the signed-in user" for free
from its single cookie jar. The Playwright harness does not, the failure is
silent in the `assertNoResultsOrValuesAreSandboxed` direction (M5), and this is a
data-access-security surface. The brief explicitly permits strengthening here
provided it is declared — this is that declaration.

Two smaller setup guards, same category: `assertUserGroupIds()` (above) and an
`expect(sandboxableQuestions.length).toBeGreaterThan(0)` + non-null dashboard
check after the fixture classification, so a fixture that stops producing cards
fails instead of leaving every downstream `for` loop iterating an empty array.

**Nothing was weakened, dropped, or merged.** All 18 upstream tests are present,
including the 12 parametrized cases and the deliberately-unmerged
gizmoViewer/widgetViewer pair (upstream comments that merging makes it flake).

## Faithfulness notes

- **The two custom views are NOT in the Sandboxing collection.** Upstream creates
  them before the collection with no `collection_id`, so they land in root ("Our
  analytics"). Consequence: upstream's `customViews` array is always **empty**
  (nothing in the Sandboxing collection matches `/Custom view/i`), and the entity
  picker finds them only because `cy.contains(name)` is scoped to the whole modal
  rather than the last picker column. Both behaviours reproduced deliberately, and
  the dead `customViews` variable is kept rather than deleted. Verified against
  the live instance: cards 98/99 sit in root, collection 17 holds the other 10.
- **Setup model:** `mb` is a test-scoped fixture so Playwright's `beforeAll`
  cannot use it. Upstream's `before` + `H.snapshot` is reproduced as a
  worker-lifetime `built` flag inside `beforeEach`, so the build runs once and
  every test (including the first) then restores the snapshot — the same ordering
  upstream has.
- `cy.wait(["@getCollectionItems","@getCollectionItems"])` is a Cypress queue that
  pops *past* responses, so it is ported as a `page.on("response")` collector
  registered before the trigger, polled to `>= 2` — not as two after-the-fact
  `waitForResponse`s.
- `cy.intercept("POST","/api/activity/recents",{statusCode:500, body:{...}})`
  specifies a body upstream, so the body is reproduced. (The brief's
  "empty body by default" warning applies to the *omitted*-body form, so it is
  **inapplicable here** — banking it rather than acting on it.)
- `cy.wait(fill("@dashcardQuery", n))` → collector + poll to `>= questions.length`,
  taking the first `n`, mirroring the queue semantics.
- Strict-mode toast trap, placeholder traps, virtualized-grid trap, DOMRect
  `deep.eq` trap, `should("not.have.value")` tautology: **none of these shapes
  appear in this spec.** Reported as inapplicable rather than as clean bills.
- The 1280×720-vs-800 viewport note: nothing in this spec failed in a
  layout-dependent way, so it never came up.

## Fixmes

**None.** No `test.fixme`, no skipped test, no product-bug claim. All 18 tests
pass on the CI uberjar.

Per the standing rule I did **not** run a Cypress cross-check (sibling slots are
live), so I **cannot** say whether upstream fails the same way anywhere — but
since nothing failed, there is nothing that needed a fidelity check.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/` — **clean**.

Checker sanity-checked, per the brief's warning that "tsc misses dead imports":
I appended `const s2SanityCheck: number = "not a number";` and confirmed tsc
reports `TS2322` at the right line, then reverted. Dead imports were then checked
**by hand** with an occurrence count over every imported symbol in both files —
this found one real dead import (`import type { MetabaseApi }` in the spec) that
tsc did not flag. Removed. Re-checked: zero dead imports in either file.

## Instance state — restored and verified

The spec creates 4 users (alice@gizmos.com, bob@widgets.com, the CA/WA pair),
one collection, ~12 cards, and mutates the permission graph. My token probe
additionally cleared `premium-embedding-token` and wrote a sandbox to the graph.

Slot 2 (port 4102) was restored to `default` afterwards and **verified**:

```
users        : only the 10 stock snapshot users — alice/bob/CA/WA all gone
sandboxes    : 0
collections  : no "Sandboxing" collection
```

`--repeat-each=3` (54 tests) passed **54/54 in 3.2m**, which is the second
consecutive-run evidence that no permission-graph state leaks between runs.

Both files restored **byte-identical** after mutation testing, confirmed by md5
against a baseline captured before the first mutation:

```
tests/sandboxing-via-ui.spec.ts    ef289ff9932f3d2e6c2c3d2ced331e29  (match)
support/sandboxing-via-ui.ts       ff150e59c8e798ce55902f8a07e7bbe5  (match)
```

`grep -c MUTATION` → 0 in both. Scratch probe spec deleted. I touched no shared
support module, no `PORTED.txt` / `QUEUE.md` / `playwright.config.ts`, committed
nothing, and never contacted port 4000.

Note: `e2e/snapshots/sandboxing_snapshot.sql` is written by this spec's setup.
That directory is **shared across slots** and gitignored (`.gitignore:54`). The
file pre-existed my session (left by an earlier Cypress run) and I overwrote it;
the name is unique to this spec so no sibling restores it. It also bakes a
slot-private H2 sample-DB path into the snapshot, which only matters if another
slot ever restores that name. Flagging rather than "fixing".

## Unexplained

One cosmetic thing I could not explain and am recording rather than inventing a
mechanism for: `getQuestionDescription` renders `query: undefined` in assertion
messages, i.e. `json_query.query` is absent from the dashcard-query response
bodies. It affects only the *text of the failure message*, never a pass/fail
decision, and upstream reads the same field the same way. I did not chase it.

## Summary (3 lines)

18/18 green on the CI uberjar, 54/54 under `--repeat-each=3`; tsc clean; instance
restored and both files md5-verified byte-identical after eight mutations.
The `signInWithCredentials` cookie-jar bug is confirmed and **avoided** (throwaway
request context), and M5 proves the avoidance is load-bearing — with API calls
leaking to admin the two "no sandboxing yet" tests pass green while measuring nothing.
Two upstream observations: the `@external` tag is dead setup (all 18 pass on
`restore("default")`), and the 12 custom-column tests cannot detect sandboxing at
all because `limit 20` + >20 rows per category makes "20 rows" true either way —
both recorded verbatim, neither acted on.
