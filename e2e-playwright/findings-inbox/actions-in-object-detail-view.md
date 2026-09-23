# actions-in-object-detail-view — port findings (slot 5, port 4105)

Source: `e2e/test/scenarios/actions/actions-in-object-detail-view.cy.spec.js` (341 lines)
Target: `e2e-playwright/tests/actions-in-object-detail-view.spec.ts`
Support: `e2e-playwright/support/actions-in-object-detail-view.ts`

## Summary (3 lines)

4/4 tests green, stable over `--repeat-each=3` (12/12), `tsc --noEmit` clean. The
`@external` tag is CORRECT here and gates precisely the right thing: db 2 under
`postgres-writable` really is the writable container, gate-OFF skips all 4.
Eight mutations, eight kills — including the decisive neuter-the-write, which died
on the table read-back with the toast still passing.

## Collision checks (done BEFORE writing anything)

- `grep -rl "actions-in-object-detail-view" tests/ support/` → **no hits**. No
  existing port names this source. Not a re-port.
- `ls tests/` → no `actions-in-object-detail-view.spec.ts`.
- The three landed actions-tier siblings — `model-actions.spec.ts`,
  `actions-on-dashboards.spec.ts`, `actions-reproductions.spec.ts` — were all read
  before writing. They are ports of **different** sources; no overlap in test
  names, and nothing here duplicates their coverage.
- `ls e2e/test/scenarios/actions/` → four `.cy.spec.js` files, no `.ts` sibling.

**Support-module name: `support/actions-in-object-detail-view.ts` — matches the
target spec basename. NO deviation.** No shared support module was edited; the
DB plumbing (`resetTestTable`) is imported from `support/actions-on-dashboards.ts`
and `createImplicitActions` / `updatePermissionsGraph` / `USER_GROUPS` from
`support/model-actions.ts`.

## What the `beforeEach` restores, and is db 2 genuinely writable here?

The upstream `beforeEach`:

1. `H.restore("postgres-writable")`
2. `H.resetTestTable({ type: "postgres", table: "scoreboard_actions" })` — DROPs
   and rebuilds `public.scoreboard_actions` (14 rows, ids 1–14)
3. grants All Users `view-data: unrestricted` + `create-queries:
   query-builder-and-native` on `WRITABLE_DB_ID`
4. `H.resyncDatabase({ dbId, tableName: "scoreboard_actions" })`
5. `H.createModelFromTableName({ tableName, idAlias: "modelId" })`

`WRITABLE_DB_ID` is the literal `2`. **Verified on `name`/`details`, not assumed.**
Probed slot 5's backend directly: after `POST /api/testing/restore/postgres-writable`,

```
db 1 | Sample Database      | h2       | dbname undefined  | port undefined
db 2 | Writable Postgres12  | postgres | dbname writable_db| port 5404
```

So db 2 here **is** the writable container (`writable_db` on :5404), not the
read-only QA sample that id 2 points at under the `postgres-12` snapshot. Every
test in this file writes to it (implicit `row/update` + `row/delete`), so the
whole file is correctly gated.

Jar verified BY IDENTITY, not `JAR_PATH`: the running slot-5 JVM reports
`version.hash = 751c2a9` (`/api/session/properties`), matching COMMIT-ID
`751c2a98`. The runner printed `(reused)` as expected.

## Gate mapping + gate-OFF control

| upstream tag | describe | reality | port |
|---|---|---|---|
| `["@external", "@actions"]` | the single top-level describe (all 4 tests) | correct — restores `postgres-writable`, rebuilds a table in the shared container, writes to it | `test.skip(!PW_QA_DB_ENABLED)` at describe level |

This is the first of the four actions specs where the tags were **not** wrong in
some direction. Nothing here is over-broad (there is no subset that could run
without the container — even the dashboard test needs a model over a writable
table) and nothing is missing.

**Gate-OFF control (`PW_QA_DB_ENABLED` unset): 4 skipped, 0 executed, 0 failed.**
**Gate-ON: 4 executed, 4 passed.** The gate therefore selects exactly the tests
it claims to.

## The neuter-the-write mutation, and where it died

**M1** — the analogue of `SET score = score` on this tier. The write here is not
SQL (the actions are *implicit* `row/update`), so the equivalent is to leave the
Score field at its prefilled value: the form still submits, the action still
executes, the row is still written — with unchanged data.

```
-  await form.getByLabel("Score", { exact: true }).fill(String(UPDATED_SCORE));
   await form.getByText("Update", { exact: true }).click();
```

**Result: killed, 2/2 "in modal" tests, at spec line 331** —
`tableInteractive().getByText("987,654,321")` `Expected: 1, Received: 0`.

The important detail is **what survived to that point**: the modal opened, the
prefill assertions passed, the Update button submitted, the execute request
returned 200, and `assertToast(page, "Successfully updated")` **passed**. Exactly
the established shape — every UI interaction intact, death on the read-back. It
also settles a suspicion I had about the fast (2–4 s) test durations: the tests
genuinely execute against the container, or M1 could not have died where it did.

Corollary worth banking: **the success toast is not a proxy for the write.** A
port that asserted only the toast would have been green against a no-op update.

## Mutation results (8 applied, 8 killed)

Every mutation was applied with an anchored replace requiring `count == 1`, then
**re-read from disk** to confirm the new text was present and the anchor gone.

**The verifier was itself sanity-checked before use**: fed an anchor occurring 0
times → `ABORT: anchor occurs 0 times`; fed one occurring 3 times → `ABORT:
anchor occurs 3 times`; file md5 unchanged after both. It also refuses a
replacement string already present in the file (no-op mutations).

| # | mutation (input inverted) | outcome | died at |
|---|---|---|---|
| M1 | drop the `fill()` of Score — update writes the row back unchanged | **killed** 2/2 | L331 table read-back `987,654,321` count 1→0 |
| M2 | feed `assertScoreFormPrefilled` a doctored row (`team_name: "Lively Lemurs"` for row 11) | **killed** 2/2 | L301 `toHaveValue` Expected "Lively Lemurs", Received "Kind Koalas" |
| M3 | `keyboard.press("Escape")` → `press("Tab")` | **killed** 2/2 | L290 `action-execute-modal` count 0→1 |
| M4 | skip `createImplicitActions` in the "in modal" test | **killed** 2/2 | L280 `object-detail actions-menu` count 1→0 |
| M5 | point the dashcard locator at a testid that does not exist | **killed** | L242 `dashcard` count 1→0 |
| M6 | fill Team Name with a **unique** name ("Zealous Zebras") — no constraint violation | **killed** | L375 `Team Name` field count 1→0 |
| M7 | tail probe: one-char near-miss on the field-level error string | **killed** | L376 count 1→0 |
| M8 | click "Cancel" instead of "Delete forever" | **killed** | L341 delete toast `toContainText` |

### Called-out weaknesses in my own mutations

- **M6 is partially blunt.** I aimed it at the two error-text assertions; it
  killed the assertion *before* them. Mechanism: a successful update calls
  `handleSubmitSuccess` → `onClose`, so the whole execute modal unmounts and the
  `Team Name` field disappears first. That is a genuinely useful finding —
  upstream's `cy.findByLabelText("Team Name").should("exist")` reads like a
  near-vacuous filler assertion, but it is actually the load-bearing *"the modal
  did not close"* check. It is not vacuous.
- **M7 is expectation-side, not input-side**, and I am flagging it as such. It is
  a deliberate follow-up at the tail M6 could not reach: **no input inversion can
  reach the error-text assertions**, because any input that avoids the duplicate
  team name also closes the modal and kills the test earlier. M7 confirms the
  matcher is exact and the message genuinely rendered (a one-character near-miss
  returns 0). The sibling assertion, `"Team_name already exists."`, passes at
  `toHaveCount(1)` in the green run, which proves the exact matcher is not
  collapsing the two similar strings into one node.

### Assertions NOT triggered by any failure mode I could induce

- **`objectDetailModal().should("be.visible")` after Escape** (the assertion the
  test is actually *named* for — "does not close object detail modal when
  pressing Esc"). M3 kills its sibling but never reaches this line. Its failure
  mode is Escape bubbling from the action modal to the object-detail modal, which
  I cannot induce without changing product code. Not vacuous — the locator
  resolves to a real, visible element in the green run — but **not independently
  killable by any input I could invert.**
- **The final `toHaveCount(0)` on `987,654,321` after delete.** M8 dies at the
  delete toast one line earlier. Not reached; recorded as an untested tail rather
  than claimed as covered.
- **M1 leaves this same final `toHaveCount(0)` vacuously true** (the value was
  never written, so it is trivially absent). Worth knowing: that assertion is
  only meaningful in sequence with the one at L331.

## Container inventory, before and after

Attributed by **contents**, not timestamps (the container clock runs ~7 h behind
the host).

| | before | after |
|---|---|---|
| tables (non-system schemas) | **37** | **37** |
| table list | identical | identical (diffed) |
| `metabase_cache_*` schemas | none | none |
| `public.scoreboard_actions` | 14 rows, ids 1–14 | 14 rows, ids 1–14 |

The spec creates no table of its own: `resetTestTable` drops and rebuilds
`public.scoreboard_actions`, which already existed. Row 12 is UPDATEd and DELETEd
during the run; the final `beforeEach` rebuilt the table, so the container is back
to its exact pre-run inventory. No foreign schema was touched.

(Note: I measured **37** tables at baseline, where an earlier sibling reported 35.
The extra two are `public.many_data_types` and `Schema A.transform_table`, left by
live sibling slots. Not attributable to this port — I did not create or remove
them, and the before/after lists are identical.)

## Port notes / decisions

- **`cy.wait("@alias")` is ported as a response QUEUE**
  (`recordAlias`/`waitForAlias`), not `page.waitForResponse`. This is load-bearing
  here, not defensive copying: the spec waits on `@prefetchValues` three times
  while the execute-modal's own `handleSubmitSuccess` fires a **fourth,
  un-awaited** prefetch, and the modal re-open for the same row is a candidate for
  RTK-Query cache service (no new request at all). Cypress pops past responses;
  `waitForResponse` cannot. Same shape as `recordGetAction` in
  `support/model-actions.ts`. `@getModelActions` is never awaited upstream →
  dropped (rule 2).
- **`createModelFromTableName` is re-implemented locally with the schema PINNED
  to `public`.** The copy in `support/actions-on-dashboards.ts` calls `getTableId`
  unpinned — safe only while `scoreboard_actions` exists in exactly one schema of
  the shared container. Pinning is a narrowing of upstream's lookup, never a
  widening. I did **not** edit the shared module.
- **`resyncDatabase` is passed `tables: ["scoreboard_actions"]`**, not the bare
  form. The stale-`initial_sync_status` hole genuinely applies here (the table is
  dropped and recreated under an already-synced database), and this is also what
  upstream does (`tableName` and `tables` are equivalent in `waitForSyncToFinish`).
- **Mantine `Modal` root reports `hidden`**: upstream's
  `actionExecuteModal().should("be.visible")` is ported as a visibility assertion
  on the modal's **contents** (`actionForm` inside it). The `should("not.exist")`
  half is a straight `toHaveCount(0)` on the root, which is fine (the root really
  does unmount).
- **Toast strict-mode hazard does not bite here.** `UndoListing.tsx:203` is
  `"Cypress" in window ? MockGroup : TransitionGroup`, so exit transitions run
  under Playwright and a dismissed toast lingers. Upstream already takes
  `.last()` of the toast list, which is the newest toast in either engine — so no
  loosening was needed and none was applied. M8 confirms the assertion still
  discriminates: with the delete cancelled, `.last()` resolved to the lingering
  *update* toast and `toContainText("Successfully deleted")` correctly failed.
- **`{ viewportHeight: 1200 }`** on the "in modal" describe → explicit
  `setViewportSize({ width: 1280, height: 1200 })` (1280 = Cypress default width,
  `e2e/support/config.js:302`). The sibling option `requestTimeout: 10000` has no
  Playwright equivalent and is dropped; `PW_ACTION_TIMEOUT` covers it. Note the
  harness otherwise runs 1280×720, not the configured 800 — the known deferred
  fix; no failure here was layout-dependent.

## Faithfulness: weak upstream assertions kept verbatim

- **`assertInputValue` uses `value || ""`.** A literal score of `0` would collapse
  to `""` and the assertion would then demand an *empty* input — a latent bug.
  Ported verbatim with the analysis inline in the support module. Rows 11/12 (the
  only rows prefilled here) have scores 70/80, so the branch is unreachable in
  this spec. **Recorded, not strengthened.**
- **One place where I transcribed Cypress semantics rather than the literal
  code, and I am calling it out:** upstream's dashboard test does
  `cy.findByTestId("dashcard").within(() => assertActionsDropdownNotExists())`.
  Cypress's `findByTestId` **throws** if the dashcard is absent, so the existence
  of the dashcard is part of the upstream assertion; a naive Playwright port
  (`expect(page.getByTestId("dashcard").getByTestId("actions-menu")).toHaveCount(0)`)
  would pass vacuously against an unrendered dashcard. The port asserts
  `toHaveCount(1)` on the dashcard first. This is transcription of implicit
  Cypress behaviour, **not** a strengthening — and M5 proves it is load-bearing.
- `should("exist")` on `findBy*` is "exactly one" (findBy throws on multiple), so
  those are ported as `toHaveCount(1)` rather than a bare `toBeVisible()`.

## Environmental / tooling checks banked

- **`tsc` misses dead imports — verified, not assumed.** I injected
  `import { modal as __unusedProbe }` plus a deliberate type error: tsc reported
  only `TS2322` and said nothing about the unused import. So the checker works
  but has the documented blind spot. Dead imports were therefore audited **by
  hand** across both files (every imported symbol has ≥2 occurrences); none found.
- Traps I checked the *mechanism* for rather than merely not observing:
  - **Virtualized grid / row not rendered**: does not apply — `scoreboard_actions`
    has 14 rows, well inside the ~18-row window, so rows 11 and 12 are always
    rendered. No `ORDER BY` dependence.
  - **`getByText(exact:true)` ≠ Cypress exact**: the ID-cell click and the
    `987,654,321` assertion both resolve to exactly one element (a strict-mode
    violation would have surfaced otherwise; M1/M5/M7 confirm the counts move as
    expected).
  - **`cy.intercept(url,{statusCode:500})`**: not used by this spec.
  - **Placeholder traps / `click({force:true})` / DOMRect `deep.eq` /
    `not.have.value` tautologies**: none of these constructs appear upstream.
- **No Cypress cross-check was run** (standing rule — sibling slots are live). I
  therefore **cannot** say whether upstream also passes; every claim above is
  about the Playwright port only.

## Fixmes / open items

- None blocking. No `fixme` markers were needed — nothing was skipped, weakened,
  merged, or stubbed.
- Two assertions are recorded above as **not triggered by any failure mode I
  could induce** (the post-Escape object-detail visibility check, and the final
  post-delete `toHaveCount(0)`). Both are non-vacuous but sit downstream of an
  assertion that dies first. I did not strengthen or restructure the test to make
  them reachable — that would deviate from upstream.

## Verification log

- First run: 4/4 passed (13.6 s)
- `--repeat-each=3`: **12/12 passed** (39.6 s) — no write-state leakage between runs
- Gate-OFF control: 4 skipped
- Final run after all mutations restored: 4/4 passed
- `bunx tsc --noEmit`: clean
- **Spec and support module restored byte-identical (md5 + `diff -q`):**
  `tests/actions-in-object-detail-view.spec.ts` = `6122308b4c484286b9183a5eea59ba56`,
  `support/actions-in-object-detail-view.ts` = `228506ff4aef21c6278c303851510471`
