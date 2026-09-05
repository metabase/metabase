# database-connection-strings — port report (slot 5, :4105)

Source: `e2e/test/scenarios/admin/database-connection-strings.cy.spec.ts` (417 lines)
Port: `tests/database-connection-strings.spec.ts` + `support/database-connection-strings.ts`
9 tests, all green. Jar verified **by identity**: `/api/session/properties` reports
`version.hash = 751c2a9`, matching COMMIT-ID `751c2a98`. Five jar backends are up; the
slot-5 one advertises `snowplow-url = http://localhost:5105` (= 4105 + 1000), i.e. it
really is pointed at this slot's own collector.

> 🔴 No connection string, password, or token value appears anywhere in this file. The
> upstream fixtures embed credentials in the string body; they are referenced by
> *shape* only ("the QA mysql fixture", "the pasted string") throughout.

## Collision checks

`grep -rl "database-connection-strings" tests/ support/` returned three files:

| File | What matched |
|---|---|
| `tests/admin-databases.spec.ts` | a comment in its own collision note, naming this spec as a *different* source |
| `tests/database-writable-connection.spec.ts` | ditto |
| `support/admin-databases.ts` | ditto |

All three are ports of other sources. **No port of my source existed**, committed or
uncommitted. `ls tests/ support/` confirms no `database-connection-strings.spec.ts` and
no `support/database-connection-strings.ts` before I wrote them. The sibling writing
`database-writable-connection` was read, not collided with; I imported
`support/admin-databases.ts` **read-only** and edited no shared module.

**Support module name: `support/database-connection-strings.ts`** — exactly the name the
brief specified. No deviation, nothing to say loudly.

## Infra tier per describe — with the gate-OFF control

The coordinator's mid-task correction (gate per-describe, not per-file) was already
satisfied: the only `test.skip` sits **inside** the nested `actual database connections`
describe. Numbers:

| Run | Executed | Skipped |
|---|---|---|
| Gate ON (`PW_QA_DB_ENABLED=1`) | 9 | 0 |
| **Gate OFF (control)** | **6** | **3** |

The difference is exactly the three `@external` tests (MySQL connect, PostgreSQL connect,
connection-failure). Nothing over-gated.

| Describe | Tier | Evidence |
|---|---|---|
| `Database connection strings` (4 tests) | **bare jar** — no container, no token, no snowplow | The parse is pure client-side regex (`DatabaseConnectionStringField.tsx` → `parse-connection-regex.ts`); nothing is sent to the backend |
| `… > actual database connections` (3 tests) | **container** — QA mysql :3304, QA postgres :5404 | Really creates live connections; gate-OFF control skips exactly these |
| `Database connection strings events` (2 tests) | **bare jar + snowplow** | See below |

**No token/EE gate anywhere.** The component and parser live in
`frontend/src/metabase/databases/`, not `enterprise/frontend/`, with no `PLUGIN_*`
indirection. The spec never calls `activateToken`. I did **not** need to work around the
`.env` trailing-comma trap — the brief flagged it, but this spec has no token dependency
at all, so it never applied. Saying that plainly rather than banking it.

## Snowplow vantage: **browser boundary** (`installSnowplowCapture`)

Not dead setup. Both tests call `H.expectUnstructuredSnowplowEvent` with an **exact
count**, so the events are the subject — rule 6's no-op stub would have made both vacuous.
Grepped, not assumed.

Both events come from `trackSimpleEvent` in
`frontend/src/metabase/databases/components/DatabaseConnectionUri/analytics.ts` — the
**frontend-emitted** class, which the browser boundary sees.

The coordinator flagged that database create/sync events are backend-emitted and would
need `mb.snowplow`. **That is true but does not apply here**: this spec asserts only on
`connection_string_parsed_success` / `connection_string_parsed_failed`, which never touch
the JVM. The three `@external` tests do create databases, but assert nothing about the
resulting backend events.

The per-slot collector would *also* have seen these (the browser POSTs to whatever
`snowplow-url` advertises, and the collector answers CORS preflight). I rejected it
because both assertions are **exact counts**, and the collector accumulates for the whole
worker lifetime across tests and `--repeat-each` runs, whereas `installSnowplowCapture` is
per-`page` and therefore per-test. Isolation is load-bearing for a count assertion.

Mutation M5 proves the capture is live rather than silently empty: it recorded a real
`connection_string_parsed_failed` payload.

## `GET /api/database` inventory

| Point | Count | Contents |
|---|---|---|
| Before | 2 | `1 h2 Sample Database`, `2 postgres Writable Postgres12` |
| After (two consecutive full runs) | 1 | `1 h2 Sample Database` |

The `Writable Postgres12` record was **pre-existing state on my own slot backend**, left by
whatever last ran on :4105 under `PW_KEEP_SLOT_BACKENDS=1`. It disappeared because
`mb.restore()` (default snapshot) resets the app DB — standard behaviour for every ported
spec, and :4105 is exclusively mine, so no sibling depended on it. The three `@external`
tests each create a Metabase *database record* pointing at the QA containers; the next
`restore()` removes them, and the final state is the clean 1-row default.

**Shared containers untouched.** `postgres-sample` reports 6 schemas before and after —
this spec only ever *connects and syncs* (a read), it never creates a schema, so it
contributes nothing to the #85 debris. I dropped no foreign schema.

Second consecutive run: 9/9 green, inventory still 1. Instance left clean.

## Mutation testing

Baseline md5 `e0122ab157376d6b2eec0e0ccdc26dfa`; **restored byte-identical and re-verified**
after every mutation, and again at the end.

| # | Mutation (input, never the expectation) | Result | Died where |
|---|---|---|---|
| M1 | Corrupt PostgreSQL fixture host in the 16-engine table | **killed** | `Host` value, 8th engine — proves the loop reaches the tail engines |
| M2 | MySQL fixture `ssl=true` → `ssl=false` | **survived — bad mutation** | see below |
| M2b | MySQL fixture: drop the `ssl` param entirely | **killed** | `toBeChecked()`, **not** the preceding `toHaveValue("on")` |
| M3 | Add a port to the pasted string in "should not clear the existing values" | **killed** | `Port` = "1111" |
| M3b | Choose MySQL instead of PostgreSQL in the same test | **killed** | tail assertion `Database type` = "PostgreSQL" |
| M4 | Wrong port on the live MySQL test | **killed** | *head* (parsed `Port` field) — tail unproven, hence M4b–M4d |
| M4b | `allowPublicKeyRetrieval` → false (unasserted param) | **survived — bad mutation** | the QA user does not need key retrieval; nothing inverted |
| M4c | Force `useSSL`/`requireSSL`/`verifyServerCertificate` | **survived — bad mutation** | connection succeeded anyway |
| M4d | Point live MySQL at a nonexistent database, co-moving **only** the head field check | **killed** | **tail** — `POST /api/database` 400 ≠ 200 |
| M10 | Same, PostgreSQL | **killed** | **tail** — 400 ≠ 200 |
| M5 | Second pasted string in the success-event test made unparseable | **killed** | event count 0 ≠ 1; capture held a real `…_failed` event |
| M6 | Re-parse a different valid string before the second blur | **killed** | **tail** — "should not track again", 2 ≠ 1 |
| M7 | Unparseable string in the Save-enabled test | **killed** | `toBeEnabled` (Save was disabled) |
| M8 | Valid string in the invalid-warning test | **killed** | warning text not found |
| M9 | Working credentials in the connection-failure test | **killed** | `status not.toBe(200)` |

### My own bad mutations, called out

- **M2 (`ssl=true` → `ssl=false`) proved nothing.** `database-field-mapper.ts` passes the
  raw `URLSearchParams` value straight into `details.ssl` (lines 58 / 124 / 153), and the
  non-empty string `"false"` is truthy, so the switch stays on. I ran the decisive probe
  the playbook asks for — flipped the assertion to `.not.toBeChecked()` under the *same*
  mutation, and it failed with "Received: checked". So this is "the data happens to
  coincide", **not** a vacuous assertion. M2b (dropping the param) is the real inversion
  and it killed.
- **M4b and M4c** both assumed a connection knob that the QA container does not actually
  care about. Neither inverted anything.
- **Tooling error, recorded:** my first attempt at M2 used a multiline `perl -pi -e`, which
  silently replaced a fixture line with the literal `X` instead of editing it. Caught by
  reading the file back, not by the test. Every subsequent mutation used an anchored Python
  replace with a `count == 1` assertion.

### Where mutants died — tail coverage

M1, M3b, M4d, M6, M10 all died at **tail** assertions, so the later assertions in the
long tests are proven load-bearing, not just the first one.

One assertion is proven by construction rather than by mutation: `button("Failed")
.toBeAttached()` in the connection-failure test is a **positive existence** check, so it
cannot be vacuous — it fails if the button never renders. M9 dies at the status assertion
that precedes it, and I could not construct a case where the POST fails but the button is
absent. Recorded as **not triggered by any failure mode I could induce**, rather than
claimed as covered.

## Vacuity flags

- 🔴 **`should("have.value", "on")` on the SSL checkbox is vacuous upstream.** Three engine
  rows (ClickHouse, MySQL, Presto) carry `{ value: "on", isChecked: true }`. `"on"` is the
  HTML *default* `value` of a checkbox with no `value` attribute and does **not** track
  checkedness. M2b is the proof: with the switch genuinely unchecked, the test died at
  `toBeChecked()` and sailed straight past `toHaveValue("on")`. The `be.checked` assertion
  is the one doing the work. **Ported verbatim** (both), with the analysis inline in the
  spec header — dropping the value check would drop an upstream assertion and
  strengthening it would be inventing intent.
- **No `should("be.empty")` and no argument-less `should("not.have.value")` anywhere in
  this spec.** The brief called both "extremely likely" in a connection-form spec. Neither
  reproduces here. Stating that plainly rather than banking the warning as a dividend.
- **No `expect(rect).to.deep.eq(...)`, no `not.be.visible` occlusion check, no
  `should("contain", …)` any-of/concatenation ambiguity** in this source either. The
  assertion set is `have.value`, `be.checked`, `be.enabled`, `exist`, `be.visible`, and
  two snowplow counts.

## Port decisions worth recording

- **`cy.paste` has no existing port.** Upstream calls the *native* `value` setter on the
  input/textarea prototype (bypassing React's value tracker), dispatches a bubbling
  `change`, then a synthetic `paste` ClipboardEvent. Reproduced verbatim in
  `support/database-connection-strings.ts`. Deliberately **not** `fill()` (fires `input`,
  and clears first — neither is what upstream does) and **not** `pressSequentially()`
  (would re-run the parse effect once per keystroke, which breaks the exact event-count
  assertions in the snowplow tests). The brief's Formik-`dirty` and MultiAutocomplete
  form traps did not arise — this form is driven entirely through the paste path plus one
  ordinary text field, and no submit is gated on a derived sibling.
- **`getByText(…, {exact:true}) ≠ testing-library exact` bit me as predicted, and the fix
  is `:text-is()`.** The feedback line renders as `<Text component="span"><Group
  component="span"><Icon/>{text}</Group></Text>`. testing-library's `getNodeText` reads
  **direct child text nodes**, so it resolves only the inner `Group`; Playwright's
  `getByText` reads full `textContent` and would match both wrapper and inner element
  (strict-mode multi-match). `:text-is()` matches only the smallest element with that exact
  text, which is the same node testing-library picks.
- **`ResponseRecorder` for both intercepts, not `waitForResponse`.** `@getDatabases` is
  consumed in a *loop* by `waitForDbSync`, which `page.waitForResponse` structurally
  cannot do. `@createDatabase` is registered as a recorder too, matching where Cypress
  registers the intercept.
- **One deliberate collapse:** upstream restores twice for the snowplow describe (file-level
  `beforeEach` plus the describe's own). The second restores the same default snapshot and
  would only force a re-sign-in. Collapsed to one `restore()` + `signInAsAdmin()`, noted in
  the spec header. No test dropped, weakened or merged.
- **Stub discipline:** this spec contains **no** `cy.intercept(url, {statusCode: 500})`.
  The connection-failure test uses a genuinely bad connection, not a stub — so the
  empty-body-vs-JSON-body hazard the brief warned about does not arise here.

## Timing note (not a defect, but worth knowing)

`DatabaseConnectionStringField` clears its success/failure line after
`FEEDBACK_TIMEOUT = 2000ms`. Every assertion on those two strings is therefore a
"did it ever appear" check with a hard 2s budget, upstream and in the port alike. The parse
is synchronous and `toBeAttached`/`toBeVisible` poll immediately, so it lands well inside
the window — 27/27 green under `--repeat-each=3`, plus two further consecutive full runs.
Flagging it because a future slowdown would surface as a mysterious flake rather than as a
timeout.

## Product observation (candidate finding, deliberately narrow)

`?ssl=false` in a connection string turns the **SSL switch on**. `database-field-mapper.ts`
assigns `details.ssl` the raw `URLSearchParams` string (lines 58 / 124 / 153) with no
boolean coercion, and `"false"` is truthy. **Measured, not inferred**: under M2 the switch
rendered checked, and asserting `.not.toBeChecked()` failed with "Received: checked".

Scope of the claim: I verified this at the **form** layer only. I did not check what
`details.ssl` ends up as in the saved database record, so I am not claiming an end-to-end
bug — only that the parser's output for an explicit `ssl=false` is the opposite of what the
string says.

## Harness / environment

- **1280×720 viewport defect**: no failure in this spec was layout-, fold- or
  popover-position-dependent, so it never came up. Nothing attributed to it and nothing
  worked around.
- **Corrupt `e2e/snapshots/blank.sql`**: not exercised — this spec only uses the default
  snapshot.
- **`WRITABLE_DB_ID` red herring**: not exercised — this spec never reads that constant.
- **No Cypress cross-check was run** (standing rule — it would break live sibling slots).
  I therefore **cannot** say whether upstream behaves identically; nothing here is claimed
  on that basis. Every mutation result above is measured against the port alone.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/`: **completely clean**, zero output — no errors
of mine and, on this pass, none from siblings either. Dead imports checked by hand (tsc
does not catch them): all 15 imported symbols are used. No debug code, no bare
`waitForTimeout`.

## Cleanup

My mutation-run `test-results/` directories were cleared by the subsequent passing runs.
The one remaining entry (`transforms-permissions-…`) belongs to a sibling and was left
alone. Nothing committed; `PORTED.txt`, `QUEUE.md` and `playwright.config.ts` untouched;
no shared support module edited.

---

## Summary

Nine tests ported and green, twice consecutively and under `--repeat-each=3`, with the
gate-OFF control confirming exactly the three `@external` tests skip and the other six run.
Fifteen mutations: twelve killed (five of them at *tail* assertions), three survived and
all three were my own bad mutations, each diagnosed to a mechanism rather than left open.
The one real vacuity is upstream's `should("have.value","on")` on the SSL checkbox —
proven vacuous by the mutation that killed at `be.checked` while sailing past it — kept
verbatim with the analysis inline; the instance was left with the same clean 1-database
inventory and zero new container schemas.
