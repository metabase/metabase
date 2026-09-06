# findings — native-reproductions (the **.js** half)

Source: `e2e/test/scenarios/native/native-reproductions.cy.spec.js` (877 lines)
Target: `tests/native-reproductions-js.spec.ts` + `support/native-reproductions-js.ts`

## The .js/.ts pair — confirmed

`ls` confirms upstream `native/` holds BOTH files and they are completely
disjoint specs:

- `native-reproductions.cy.spec.js` — 26925 bytes — **this port**
- `native-reproductions.cy.spec.ts` — 29349 bytes — ported earlier today to
  `tests/native-reproductions.spec.ts` + `support/native-reproductions.ts`,
  **not touched**.

Name deviation (deliberate, and the support module matches exactly): target and
support module both carry the `-js` suffix — `native-reproductions-js.spec.ts` /
`native-reproductions-js.ts`. The `.ts` half's support module is imported
read-only for three helpers (`startNewNativeModel`, `triggerMouseEvent`, and
originally `clientRect`).

## 🔴 PRODUCT REGRESSION: the native database picker auto-picks the first database

**This is the migration dividend of the port.** `issue 18148` is `test.fixme`'d
on it; full evidence is in the spec's block comment.

`DataSelector.skipSteps()`
(`frontend/src/metabase/querying/common/components/DataSelector/DataSelector.tsx:707`)
auto-selects a database on the DATABASE step when `useOnlyAvailableDatabase`
(a defaultProp, `true`, line 289) and nothing is selected yet. PR **#64406**
(`2a6741df9cf`, 2025-12-18, *"Do not pick unsupported databases automatically in
transforms"*) changed the guard from

```js
if (databases && databases.length === 1) {   // auto-select the ONLY one
  this.onChangeDatabase(databases[0]);
```

to

```js
const enabledDatabases = databases.filter((db) => !databaseIsDisabled?.(db));
if (enabledDatabases.length >= 1) {          // auto-select the FIRST
  this.onChangeDatabase(enabledDatabases[0]);
```

while the comment directly above it still reads *"for steps where there's a
single option sometimes we want to automatically select it"*. The PR's subject
was filtering **disabled** databases; widening `=== 1` to `>= 1` looks
unintended and is a separate behaviour change that rode along with it.

Measured on the jar (`version.hash` `751c2a9` == `target/uberjar/COMMIT-ID`
`751c2a98`), fresh restore, `last-used-native-database-id` confirmed `null`
beforehand:

| t | observation |
|---|---|
| +674ms | picker open, `gui-builder-data` = `"Select a database"`, popover lists **both** `Sample Database` and `sqlite` |
| +752ms | FE issues `PUT /api/setting/last-used-native-database-id` |
| +816ms | `gui-builder-data` = `"Sample Database"`, popover count **0** — never reopens |

**Why this pins the cause instead of merely fitting it:** the instance had
**two** enabled databases when the auto-select fired. Under the old `=== 1`
guard that is impossible — only `>= 1` can produce it. And the
`PUT last-used-native-database-id` is reachable only via `onChangeDatabase` →
`View.tsx:350 rememberLastUsedDatabase`, so the app performed a genuine
*selection*, not just a re-render.

Ruled out as port drift:
- **Not the parked-cursor family.** Parking the real mouse far from the popover
  before it mounts changes nothing — both arms auto-select (controlled probe,
  `park=true` / `park=false`).
- **Not the sync wait.** The port's only deviation from upstream here is
  `addSqliteDatabase` polling `initial_sync_status` where `cy.addSQLiteDatabase`
  is a bare POST. It runs entirely before `page.goto` and can only make the
  database list *more* complete.

**Explicitly NOT verified:** whether the Cypress original also fails on this
artifact — a cross-check was out of scope for this port. The window between the
picker painting and the auto-select is ~80ms: short but non-zero, so upstream is
plausibly **flaky** rather than reliably red. I could not measure that and am not
claiming it. What is measured is that the window is far too short for this port
to use, and that nothing reopens the picker afterwards.

The test is left as a faithful transcription rather than reworked to win the
race: winning it would assert nothing about #18148 and would hide the regression.

## Stale and misleading tags (the tags misled twice, in opposite directions)

- `issue 21597` carries `{ tags: "@external" }` and needs **nothing**. Its own
  header comment explains why: PR#54453 removed the change-the-database mechanic,
  so the test now types `SELECT 1` and mocks `POST /api/card` with a 400. No
  second database, no container. **Tag is stale** — gating on it would have
  skipped a test that runs fine on the bare jar. Deliberately ungated; it passes.
- `issue 31926` (`@external`) is the **only** genuinely container-dependent
  describe (`H.addPostgresDatabase` → QA Postgres on :5404). Gated on
  `PW_QA_DB_ENABLED`; executed and passing this run.
- `issue 18148` adds a **SQLite** database — a built-in driver reading the
  repo-root `resources/sqlite-fixture.db`, with slot backends running from
  `REPO_ROOT`. Not a container dependency, so **not** gated, despite "adds a
  database" looking like external infra.
- Nothing in this file touches the writable container, so **#85's schema-debris
  hazards do not apply** and no schema pinning was needed. No `WRITABLE_DB_ID`
  reference here, so the `2`-is-read-only red herring never came up.

## Upstream `@skip` ported as a skip

`issue 20625` carries `{ tags: "@skip" }` upstream ("realpress messes with
cypress 13"), i.e. it is excluded from every CI run. Both its tests are
transcribed in full and skipped with that reason, so the port stays complete.
Un-skip only together with upstream.

## Inherited-file audit (a cancelled agent's partial work)

Two untracked files were on disk. Diffed line-by-line against the Cypress
original before adopting. The transcription was **faithful** — describes 1:1, in
upstream order, nothing merged or dropped, and the analysis comments were
accurate where I could check them (verified `H.sidebar()` = `cy.get("main aside")`,
`cartesianChartCircle()` = `cartesianChartCircles().should("be.visible")`,
`NativeEditor.completion(label)` = `.cm-completionLabel` `.contains()` `.parent()`,
`cy.addSQLiteDatabase` being a bare POST, and `createQuestion` genuinely
forwarding `visualization_settings` where `createNativeCard` hardcodes `{}`).

Two defects found and fixed:

1. **Live debug code left mid-investigation** in `issue 18148` — two
   `console.log("DBG-…")` calls and a bare `await page.waitForTimeout(3000)`
   sitting between the popover assertions and the `sqlite` click. The 3s sleep
   was the cancelled agent papering over exactly the regression above. Removed.
   Note this is a *milder* instance of the batch-12 gotcha: no mutation string
   was left in a shared constant, so nothing read as falsely green — but the
   sleep would have shipped as an unexplained 3s tax on a test that cannot pass.
2. **Dead import** — `clientRect` imported from `support/native-reproductions`
   and never used. `tsc` does not flag it (no `noUnusedLocals`). Removed.

No live mutation was found in either file.

## Port drift found by running it: issue 19451 needed a metadata anchor

Passed in isolation, failed 1-in-4 in a full-file `--repeat-each` run — the
"passes in isolation, fails in sequence" signature the playbook says not to
write off as flake.

The field-filter picker decides which **step** to open on from the mapped
field's table metadata. If `GET /api/table/<PRODUCTS_ID>/query_metadata` has not
landed when "Products" is clicked, the picker cannot resolve the selection and
opens on the TABLE step rather than the FIELD step — so there is no
`chevronleft` back button, and the next click hangs forever. The state is
**terminal**: 30s of Playwright retry does not rescue it, which is what made it
look like a bad selector rather than a race.

Proven causal by inversion probe rather than inferred: with a 2.5s route delay
on `/api/(table|field|database)/`, the passing trace's
`+291ms GET /api/table/7/query_metadata` disappears, the picker instead fetches
`/api/database/1/schema/PUBLIC`, and it opens on the table list — 6/6
field-level undelayed, table-list under the delay.

Fix is PORTING's standard one: anchor on the response that populates the list
before resolving the row (never a sleep). `PRODUCTS_ID` read from
`cypress_sample_database.json` (`7`), not guessed. Upstream never saw this
because Cypress's command queue paces the two clicks apart.

## Mutation testing

Method: invert the **input** (or the action), never the expectation, and record
**where** each mutant died. 20 mutants over two batches; the spec was restored
byte-identical to pristine afterwards (`diff` clean) before the final runs.

**Killed (15).** Batch 1 — `12439`, `16886`, `16914`, `17060`, `19451`, `20044`,
`21597`, `23510`, `30680`, `31926`, `34330`, `35344`, `46308`. Batch 2 —
`12439b`, `21034b`.

Where they died matters more than that they died:

- **The three absence assertions are load-bearing, not satisfied by mount lag.**
  `16914` (never hide the HIDDEN column) died at the *tail* `toHaveCount(0)` on
  "HIDDEN", past its "VISIBLE" anchor; `20044` (stay admin instead of signing in
  as nodata) died at the "Explore results" `toHaveCount(0)`; `30680` (never open
  the Columns tab) died at the action-buttons `toHaveCount(0)`. This was the
  batch's main target, given FINDINGS #73.
- **Tail-aimed mutants confirmed the tails.** `17060`, `19451`, `23510`,
  `35344`, `46308` all died at their final assertions rather than at setup.
- **`21597`'s mocked message is genuinely asserted** — fulfilling with a
  different string while leaving the asserted `message` constant untouched
  killed it (not a both-sides mutation).

**Two mutants I got wrong, called out as such:**

- `m12439` (`HAVING false` spliced before `GROUP BY`) is invalid H2 syntax, so
  it killed the test at the very first click and proved nothing about the tail.
  Redone as `m12439b` (never open the viz-settings sidebar), which correctly
  died at the X-axis sidebar assertion.
- `m21034` typed the second character with `{ focus: false }`, so the keystroke
  never landed and no second autocomplete fired — it read as a surviving mutant
  when the assertion was fine. Redone as `m21034b` with focus: killed,
  `Expected: 1, Received: 2`.

**One genuine survivor — `21550`, and it is vacuous UPSTREAM too.**
`expect(clientWidth).toBeGreaterThanOrEqual(preWidth - 2)`. A 20-line snippet
makes the `<pre>` genuinely overflow vertically and the assertion still passes.
Measured geometry under that mutation:

```
{preWidth:307, clientWidth:305, scrollWidth:305,
 clientH:318, scrollH:336, overflowX:"auto", overflowY:"auto",
 border:"1px/1px", whiteSpace:"pre-wrap"}
```

`scrollH` (336) > `clientH` (318) — a scrollbar *is* warranted — yet
`clientWidth` is still exactly `preWidth − 2` (the two 1px borders). Chromium's
scrollbars here are **overlay** scrollbars and consume no layout width, so
`clientWidth` can never shrink and the inequality cannot go false.
`white-space: pre-wrap` separately rules out horizontal overflow
(`scrollWidth == clientWidth`), which is why my first attempt (one very long
line) was a no-op. Cypress's `expect(clientWidth).to.be.gte(...)` reads the same
two DOM properties, so this is **vacuous upstream, not port drift**. Left
verbatim with the measurement inline rather than strengthened; a non-vacuous
form would assert `scrollHeight <= clientHeight`.

**One weak-but-faithful assertion — `35785`.** Deleting the save entirely leaves
it green, because the pre-save URL is already `/question/<id>`. Upstream's
`cy.url().should("include", "/question")` has exactly that property: it catches
only the specific #35785 redirect (to the `from` tag's value, `/2025-10-02`) and
passes for any other outcome including "nothing happened". Recorded inline, not
strengthened.

**`22991` — capability probe rather than an input mutation.** I could not induce
a real "no permissions" screen (that *is* the bug), so instead I answered
PORTING's "can this locator ever match?" by swapping the asserted text for text
that is on the page. The negated any-of went red (`Expected: 0, Received: 2`,
both `main` elements matching), proving the filter/negation machinery fires and
the check is not structurally vacuous. Stated precisely: **the assertion is
capable of failing; the actual failure mode is not one I could induce.**

**Not mutated:** `20625` (upstream `@skip`, ported but skipped) and `18148`
(`test.fixme` on the regression above).

## Verification

- Jar confirmed by identity, not by env var: `/api/session/properties`
  `version.hash` = `751c2a9`, `target/uberjar/COMMIT-ID` = `751c2a98`, and
  `ps` shows `java -jar …/target/uberjar/metabase.jar` on :4104. (Necessary —
  `PW_KEEP_SLOT_BACKENDS=1` prints `(reused)` and silently ignores `JAR_PATH`.)
- PR #64406 confirmed an ancestor of `origin/master`, so the regression is in
  the jar by construction.

## Run results

Command (foreground, jar, `PW_QA_DB_ENABLED=1`, `TZ=US/Pacific`, `--workers=1`):

- Final: `--repeat-each=3` → **57 passed, 9 skipped, 0 failed** (1.5m).
  The 9 skips are 3 runs × (2 × upstream-`@skip` `20625` + 1 × `18148` fixme).
- `bunx tsc --noEmit` — **clean for this spec and its support module.**
  (Unrelated pre-existing error in a sibling agent's file:
  `tests/actions-on-dashboards.spec.ts(1181,15): TS2304: Cannot find name
  'openActionEditor'`. Not mine, not touched.)

Full-file green runs since the 19451 fix: `--repeat-each=3` (57/57),
`--repeat-each=2` (38/38), and 3 × single (19/19 each).

### Gate-OFF control (FINDINGS #67/#49)

Required because a green run must not be a run that never executed. Measured:

| | skipped | passed |
|---|---|---|
| `PW_QA_DB_ENABLED=1` | 3 (`20625` ×2, `18148` fixme) | 19 |
| gate unset | 4 (+ `31926`) | 17 |

So the gate is real *and* narrow: exactly one test moves, and the other 19 do
not silently ride on it. With the gate on, `31926` executes and passes, and its
mutation (`m31926`, never switch the database) **killed** it — confirming it
really exercises the QA Postgres path rather than being skipped-but-reported.

### Residual, recorded rather than explained away

The gate-OFF run above also produced **one** `19451` failure (17 passed / 1
failed), post-anchor. I could not capture its cause: a sibling agent's run wiped
the shared `test-results/` before I read the `error-context.md` (the PORTING
shared-artifacts hazard — subsequent runs used a private `--output`).
Re-running `19451` alone 6/6 and the full file 5 more times (11 further
executions of this test) reproduced nothing.

I am **not** claiming the anchor is incomplete, and I am not inventing a
mechanism for a failure I did not observe. What is established: the anchor fixed
a measured, causally-proven ordering bug that reproduced 1-in-4 before it and
0-in-11 after. What is unestablished: whether that single post-fix failure was
the same bug, box contention from the concurrent sibling run, or something else.
Worth re-checking if `19451` ever goes red on CI.

## Housekeeping

- Scratch probe spec and `test-results-probe4/` removed.
- No shared support module edited. `PORTED.txt` / `QUEUE.md` /
  `build-helper-index.mjs` untouched. Nothing committed.
