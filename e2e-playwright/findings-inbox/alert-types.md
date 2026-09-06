# alert-types — port findings (SLOT 2, port 4102)

Source: `e2e/test/scenarios/sharing/alert/alert-types.cy.spec.js` (143 lines)
Target: `e2e-playwright/tests/alert-types.spec.ts`
Support: **`support/alert-types.ts`** — the expected name; no deviation to report.

## Collision checks

- `grep -rl "alert-types" tests/ support/` → **no hits** before I started. No existing port of my source.
- `ls support/` → **no `alert-types.ts`**. Created it.
- Read all three siblings (`alert.spec.ts`, `email-alert.spec.ts`, `alert-permissions.spec.ts`) and
  `support/alert.ts` / `support/alert-permissions.ts`. Reused read-only: `setupSMTP` + `isMaildevRunning`
  (`support/onboarding-extras.ts`), `ORDERS_QUESTION_ID` / `ORDERS_BY_YEAR_QUESTION_ID` / `SAMPLE_DATABASE`
  (`support/sample-data.ts`), `createQuestion` (`support/factories.ts`), `modal` / `popover` / `visitQuestion`
  (`support/ui.ts`). No shared module edited.
- `git status` at the end shows only my two new files; `QUEUE.md` and the `admin-reproductions.*` files are
  another slot's and were **not** touched. Nothing committed.

## Container engagement — probed, not assumed

### maildev: **ENGAGES.** Gate is real.
Probed by **mechanism**, directly against my own slot backend (:4102), not by message count:

| `email-smtp-port` | `PUT /api/email` |
|---|---|
| 1026 (dead) | **400** `{"errors":{"email-smtp-host":"Wrong host or port", ...}}` |
| 1025 (live) | **200** |

So `setupSMTP` in the `beforeEach` genuinely requires the container — `check-and-update-settings` →
`test-smtp-connection` live-connects before saving. Every test in the file therefore needs maildev.

The tag is nonetheless **over-broad about what maildev does here**: no test sends or reads mail. SMTP is
configured only so the alert modal has an available channel and the "New alert" form renders.

- **Inbox exposure: NONE.** No assertion in this spec reads delivered mail, so the shared-inbox hazard
  cannot reach me. No isolation was needed.
- **Inbox exposer: YES.** `setupSMTP` DELETEs the shared inbox once per test (4× per run, and this port ran
  ~60 test executions today across mutants). That is upstream's behaviour and I did not deviate from it.
  Flagging it for the siblings.

### webhook-tester: **DOES NOT ENGAGE.**
Probed by **request-count delta** (the probe the brief says is valid for :9080):
`GET /api/session/00000000-.../requests` → **1 before**, **1 after ~60 test executions**.
Consistent with the code: this spec's only channel traffic is `GET /api/channel`, which lists the `channel`
table; the connection test is the separate `POST /api/channel/test`. Independent confirmation of the
sibling finding — I did not inherit it.

### maildev-ssl: **inapplicable by mechanism.** `setupSMTP` sends `email-smtp-security: "none"`.

### snowplow: none. Correction to the brief's wording.
- FE: `grep -rn "trackSimpleEvent\|trackSchemaEvent" frontend/src/metabase/notifications/` → **0**.
- BE: 18 hits for `analytics|snowplow` under `src/metabase/notification/`, but **all are Prometheus**
  (`analytics/inc!`, `observe!`, `dec-gauge!`) and **all live in `send.clj` / `temp_storage.clj`**, i.e. the
  delivery path. This spec creates alerts and never fires them, so none execute.
  The brief said "zero emission in the notification BE namespaces" — that is **not quite right** (there is
  metric emission); the correct claim is **zero Snowplow**, which is what matters. No vantage wired.

## Gate mapping + gate-OFF control

Upstream: one tag, `describe("scenarios > alert > types", { tags: "@external" })`, covering all 4 tests.
Queue gates: `external, email` — both resolve to the **same single requirement: maildev on :1025**.

- **`afterEach`: checked, there is NONE** anywhere in the source (grep). So gating at `beforeEach` level is
  safe — no teardown is left dangling by an early skip. Did not assume either way.
- Skip placed as the first statement of the top-level `beforeEach`, ahead of `restore`/`signInAsAdmin`.

**Two-arm control:**

| arm | result |
|---|---|
| gate ON (`maildevUp = await isMaildevRunning()`, container up) | **4 passed** |
| gate OFF (forced `maildevUp = false`) | **4 skipped** |

Both arms reported; the gate demonstrably controls execution rather than being decorative.

## Token

**No predicate applies — genuinely inapplicable, checked by mechanism.**
The spec never calls `activateToken`. Nothing on the alert-creation path is feature-gated:
`send_condition` / `send_once` are OSS notification-model fields, and `CreateOrEditQuestionAlertModal`
has no `PLUGIN_*` or feature check on the goal select or the trigger options
(`getAlertTriggerOptions` → `hasProperGoalForAlert` → `getAlertType`, all pure viz-settings logic).
No token was activated, so **nothing needed restoring** and no gating-ahead-of-`activateToken` question arises.
No two-arm token control is applicable: there is no arm to vary.

**Slot 2 final feature count: 59 `token-features` keys, ENABLED = 0.** Same at the start of my session, so
I left the slot as I found it. (I report what I measured; I did not try to match 42 or 52 — neither is this
slot's number, because this slot has no token at all.) No token values printed anywhere.

**Jar verified BY IDENTITY**, not `JAR_PATH`: `ps` shows `java -jar .../target/uberjar/metabase.jar`, and
`/api/session/properties` on :4102 reports `version.hash = 751c2a9`, matching COMMIT-ID `751c2a98`.

## Fixture ids — every one, and where it was read from

Nothing guessed. All read at import time from the generated JSON via `support/sample-data.ts`:

| id | value | source |
|---|---|---|
| `ORDERS_QUESTION_ID` | **94** | `cypress_sample_instance_data.json` → questions, name `"Orders"` |
| `ORDERS_BY_YEAR_QUESTION_ID` | **96** | same file, name `"Orders, Count, Grouped by Created At (year)"` |
| `SAMPLE_DATABASE.PEOPLE_ID` | **6** | `cypress_sample_database.json` |
| `SAMPLE_DATABASE.PEOPLE.SOURCE` | **53** | same |
| `SAMPLE_DATABASE.PEOPLE.CREATED_AT` | **57** | same |

(Confirmed by dumping the JSON; matches the brief's 94/96. `ORDERS_COUNT`=95 exists but this spec
does not use it.)

## Absence assertions

**There are NONE in this spec** — no `should("not.exist")`, no zero-count, in either the source or the port.
Stated explicitly so the absence is not read as an oversight. The positive-anchor rule therefore has nothing
to apply to.

The one thing that *looks* like an absence, `should("not.be.enabled")`, is a **state assertion on a resolved
element**, not a zero-assertion — see below. `toHaveJSProperty` requires the locator to resolve, and the
`toHaveText` on the next line requires it again, so element existence is asserted exactly as
`cy.findByTestId` asserts it upstream.

## 🔴 The one real port hazard: `be.enabled` does NOT map to `toBeDisabled()`

`alert-goal-select` is **two different elements** depending on the branch
(`CreateOrEditQuestionAlertModal.tsx:327` vs `:338`):
- `hasSingleTriggerOption` → a Mantine `<Paper>`, i.e. a plain `<div>`
- otherwise → a Mantine `<Select>`, i.e. an `<input>`

Sizzle's `:enabled` is `elem.disabled === false`. On the `<div>`, `disabled` is `undefined`, so `:enabled`
does not match and Cypress's `not.be.enabled` passes. **Playwright's `toBeDisabled()` uses the ARIA notion
and considers a bare `<div>` ENABLED**, so `not.toBeEnabled()` would have FAILED against unchanged product
code — a port-drift failure that would have looked like a product bug.

Ported as `not.toHaveJSProperty("disabled", false)` / `toHaveJSProperty("disabled", false)`, which
reproduces the jQuery predicate exactly and keeps upstream's real discriminating power (if the single-option
branch regressed to a Select, `disabled` would be `false` and it would fail — mutant M4 proves this).

**Empirically confirmed by mutant M4's failure output**, which printed the resolved element:
`<div data-with-border="true" data-testid="alert-goal-select" class="...mb-mantine-Paper-root">` with
`disabled` = `"undefined"`. And by M5/M7/M8, which printed the other branch:
`<input readonly ... data-testid="alert-goal-select" class="...mb-mantine-Select-input">`.
So `data-testid` lands on the `<input>` in the Select branch — the assumption that made upstream's
`should("be.enabled")` work at all, verified rather than assumed.

Other deliberate re-expressions (all documented inline in the spec header):
- `cy.findByText("Done").click()` → `getByRole("button", …)`; the text form strict-mode-violates on the
  Mantine label span + inner wrapper. Upstream's *second* occurrence is already `cy.button("Done")`.
- popover options → `getByRole("option", { name })` rather than `getByText`, same strict-mode reason.
- `cy.intercept`/`cy.wait` aliases → `page.waitForResponse` promises created **before** the triggering
  action (Cypress's alias queue pops past responses; Playwright's does not). Wrapped in
  `waitForChannels` / `waitForAlertSave` in the support module so the ordering requirement is stated once.

## Mutation testing

**Verifier sanity-checked BEFORE use** (`s2-alert-types-mutate.mjs`), 6 self-checks, all passing:

| # | check | result |
|---|---|---|
| S1 | 0 occurrences → abort | ABORT, exit 1 |
| S2 | ambiguous anchor → abort | ABORT (caught `"has_result"` appearing 2×, a real ambiguity) |
| S3 | no-op (find === replace) → abort | ABORT, exit 1 |
| S4 | file untouched after 3 aborts | md5 unchanged ✅ |
| S5 | real single-site apply | applied, md5 changed, grep confirms |
| S6 | restore byte-identical | md5 back to `f3844ca5…` ✅ |

It also always mutates **from the pristine copy**, never from a possibly-mutated file, and writes only after
every check has passed.

| # | mutation | kind | result | where it died |
|---|---|---|---|---|
| M1 | `graph.show_goal: true → false` | input inversion | **KILLED** | line 179, `chart-container` `toContainText("Goal")` |
| M2 | drop the `Delete this Alert after it's triggered` click | input inversion, tail | **KILLED** | line 218, the **last line** — `send_once` `toBe(true)` |
| M3 | click "below the goal" instead of "above" | input inversion, tail | **KILLED** | line 219 — `send_condition` `toBe("goal_above")` |
| M4 | flip `not.toHaveJSProperty` → `toHaveJSProperty` in rows test | assertion | **KILLED ×2** (both rows tests) | line 148 |
| M6 | rows trigger label `"…has results"` → `"…has resultsX"` | assertion, tail | **KILLED ×2** | line 152 |

Every mutant **landed** (verifier printed `APPLIED 1 site` with an md5 change each time) and **every one was
killed**. No survivors. Deaths are spread across the assertion tails (M2 and M3 die on the final two lines of
their test), not bunched at the first assertion.

**Restored byte-identical after every single mutant** — the verifier re-checks md5 on restore and printed
`RESTORED md5=f3844ca5f01fa10451ef81cec543557f` each time.

### Probes (M5 / M7 / M8) — and one bad mutation of mine

These were not survivor-investigations; they were **presence probes** aimed at the last test.

- **M5** (goal ON + `graph.metrics: ["count"]`): killed — but by rendering an **enabled Select**, i.e. goal
  options *were* offered. Not the outcome I predicted.
- **M7** (goal ON + `graph.metrics: ["count","count_2"]`): **a bad mutation on my part.** The modal receives
  the QB's **computed** settings (`getVisualizationSettings` → `getComputedSettingsForSeries`), not the
  card's raw ones, so a metric naming a non-existent result column is normalised away. Calling it out rather
  than reporting it as a result.
- **M8** (goal ON + **two aggregations**, the genuine metric-multi-series shape): also rendered an enabled
  Select. **I do not have a confirmed explanation for this** and am recording it as unexplained rather than
  inventing a mechanism.

### FIXME (upstream, not port drift)

The predicate is `getAlertType` (`frontend/src/metabase/notifications/utils.ts:496-509`):
`graph.show_goal && graph.metrics.length === 1`.
`multiSeriesQuestionWithGoal` sets **no `visualization_settings` at all**, so `goalEnabled` is falsy and the
multi-series arm is **never reached** — the test titled *"should not be possible to create goal based alert
for a multi-series question"* passes through exactly the same code path as *"timeseries question without a
goal"*, which the rows describe already covers. The fixture's name promises a goal it never sets.

Left **exactly as upstream wrote it** (faithfulness), with the analysis inline in the spec header. This is a
note for whoever owns the Cypress spec.

**No Cypress cross-check was run** — I cannot say whether upstream also behaves this way in its own harness.

## Runs

- First green: **4 passed (11.3s)**.
- `--repeat-each=3`: **12 passed (32.2s)**, twice (before and after the FIXME comment was added).
- `bunx tsc --noEmit`: **clean, exit 0**, run from `e2e-playwright/` (never the repo root).
- 🔴 **`tsc` is silent on dead imports, so I hand-audited**: a script extracted all 14 imported symbols in
  the spec and all 3 in the support module and counted occurrences in the import-stripped body.
  **Zero dead imports.**
- The 1.3s runtimes looked suspiciously fast, so I treated them as a possible "green run that never
  executed" — the mutation results settle it: every test demonstrably executes its assertions, and the
  gate-OFF arm shows what a genuine non-execution looks like (`-` / "4 skipped", not `✓`).

## Ruled out / not observed

- `blank.sql`, snapshot 30-day fuse, viewport: not touched; no snapshot regenerated.
- `pressSequentially` caret-0, placeholder traps, `MultiAutocomplete` blur trap, toast lingering, Mantine
  `Modal` zero-height box: **all inapplicable** — this spec types nothing, has no recipient picker, asserts
  no toast, and asserts on modal *contents* (`getByText`, `getByTestId`) rather than the modal box.
- `signInWithCredentials`: **inapplicable by mechanism** — the port only calls `mb.signInAsAdmin()`, which
  takes `LOGIN_CACHE`'s cached-session cookie path and never POSTs `/api/session`, so the API cookie jar is
  never poisoned. Only one user (admin) is ever used.

## Summary (3 lines)

Ported all 4 tests faithfully; green 4/4 and 12/12 under `--repeat-each=3`, tsc clean, no dead imports.
The one genuine port hazard was `should("be.enabled")`, which does **not** map to `toBeDisabled()` — the
target is a `<div>` in one branch and an `<input>` in the other, and the naive port would have failed
against correct product code; `toHaveJSProperty("disabled", …)` reproduces jQuery's `:enabled` exactly.
maildev genuinely engages (400 vs 200 mechanism probe, gate-OFF control skips all 4); webhook-tester does
not (request count 1 → 1); 5 mutants all killed with deaths at the assertion tails; and upstream's
multi-series test is flagged as not reaching the guard it is named after, left unchanged.
