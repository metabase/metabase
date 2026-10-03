# custom-column-2 (slot 4 / port 4104)

Source: `e2e/test/scenarios/custom-column/custom-column-2.cy.spec.js` (483 lines, 28 tests, 5 describes)
Target: `e2e-playwright/tests/custom-column-2.spec.ts`
Support module: **`support/custom-column-2.ts`** — matches the spec name (no dangling-import risk).

Jar verified **by identity**: `GET :4104/api/session/properties` → `version.hash = 751c2a9`,
matching `target/uberjar/COMMIT-ID = 751c2a98`; `ps` shows `java -jar …/target/uberjar/metabase.jar`.

## Collision checks

- `grep -rl "custom-column-2" tests/ support/` → **no hits** before this port. No uncommitted port of my source exists.
- `ls tests/ | grep custom` → `custom-column-1`, `custom-column-3`, `custom-column-reproductions-1/-2`,
  `custom-viz`, `detail-visualization-custom-column`, `joins-custom-expressions`,
  `sdk-iframe-custom-elements-api`. None of these is a port of `custom-column-2.cy.spec.js`.
- Existing support modules reused **read-only**: `custom-column.ts` (`customExpressionEditor`),
  `custom-column-3.ts` (`focusCustomExpressionEditor`, `clearCustomExpressionEditor`,
  `customExpressionName`), `ad-hoc-question.ts`, `joins.ts`, `notebook.ts`, `ui.ts`,
  `filters-repros.ts`, `documents.ts`. No shared file edited.

## Results

| run | command | result |
|---|---|---|
| 1 | gate ON | 22 passed / 6 failed (all port drift — see below) |
| 2 | gate ON, after fixes | **28 passed** (40.6s) |
| 3 | gate ON, `--repeat-each=2` | **56 passed** (1.6m) |
| 4 | **gate OFF control** (no `PW_QA_DB_ENABLED`) | **23 passed / 5 skipped** (30.7s) |
| 5 | gate ON, after mutation restore | **28 passed** (39.6s) |

`bunx tsc --noEmit` → **clean**, no errors at all (mine or anyone else's).

## Infra tier per describe, with the gate-OFF control

| describe | tests | tier | gate |
|---|---|---|---|
| `> data type` | 5 | `@external`: `H.restore("postgres-12")` + QA Postgres12 | `test.skip(!PW_QA_DB_ENABLED)` |
| `> error feedback` | 2 | bare jar, H2 sample DB | none |
| `> expression editor` | 3 | bare jar | none |
| `> help text` (incl. nested `> visibility`) | 10 | bare jar | none |
| `> exiting the editor` | 8 | bare jar | none |

**Gate-OFF control:** exactly the 5 `> data type` tests skip; 23 execute and pass. Gate ON: 28 execute,
0 skip. So the gate is real and correctly scoped — not "everything correctly skipped".

**Tag accuracy (verified, not assumed).** The `@external` tag is **describe-level and over-broad in
scope, but correctly placed**: only `should understand date functions` actually queries QA Postgres12
(`miniPicker → "QA Postgres12" → "Orders"`). The other four tests use the H2 sample DB
(`PRODUCTS_ID` / `PEOPLE_ID` / `ORDERS_ID`) and are gated only because the *shared* `beforeEach`
does `H.restore(); H.restore("postgres-12");`. Splitting them would change the snapshot each test
runs under, so describe-level gating is the faithful choice; noting it here as a future
tier-reduction candidate (4 tests could move to the bare jar). No describe carries a *missing*
tag — describes 2–5 touch nothing external.

Container tier available and used: `metabase-e2e-postgres-sample-1` on `:5404`,
`e2e/snapshots/postgres_12.sql` present. No writable-DB / `WRITABLE_DB_ID` reference in this spec,
so the postgres-12-vs-postgres-writable red herring does not apply.

---

## 🔴 Finding 1 (mechanism, named and measured): `{enter}` after typing is a **no-op that inserts a newline**, because of `@codemirror/autocomplete`'s `interactionDelay`

The brief warned that "an `{Enter}` in a Cypress expression string is a COMPLETION ACCEPT, not a
newline". True — but the *reason* it fails in Playwright is now pinned to a specific library
constant, and it is **not** a re-nudge problem.

`acceptCompletion` and `moveCompletionSelection` both bail with

```js
Date.now() - cState.open.timestamp < view.state.facet(completionConfig).interactionDelay
    → return false
```

(`node_modules/@codemirror/autocomplete/dist/index.js:1044,1066`; default `interactionDelay: 75`
at :389). Metabase's `autocompletion({...})` in
`frontend/src/metabase/querying/expressions/suggestions/suggest.ts` sets `closeOnBlur:false`,
`activateOnTyping:true`, `activateOnTypingDelay:0` — and leaves `interactionDelay` at the default.

So for **75ms after the suggestion tooltip opens**, Enter / Mod-j / an option click are all silently
refused, and a refused Enter falls through to `insertNewline`.

Measured on this box (jar `751c2a9`), typing `rou` then:

| variant | result |
|---|---|
| Enter immediately after the dropdown is `toBeVisible()` | doc = `["rou", ""]` — **newline inserted** |
| a 2nd Enter | `["rou", "", ""]` |
| a 3rd Enter | `["rou", "", "", ""]` |
| Enter after `waitForTimeout(300)` | `round(column)` ✅ |
| `keyboard.type("rou", {delay: 50})` then Enter | `round(column)` ✅ |

Two consequences worth propagating:

1. **The tooltip DOM is NOT a valid gate.** The first option renders with
   `aria-selected="true"` *immediately* — measured identical HTML at 0ms and at 300ms — while
   `acceptCompletion` still refuses. This is the "gate on the element the handler reads" rule
   failing: the handler reads `cState.open.timestamp`, which has **no DOM signal at all**.
2. **A refused Enter corrupts the document silently.** It doesn't throw; it inserts a newline, and
   `.cm-content`'s `textContent` concatenates lines with no separator, so the value still *reads*
   as `"rou"`. The damage surfaces far downstream. A `toPass` retry loop is therefore **unsafe**
   here (I tried it: the first refused Enter destroys the completion context and every retry adds
   another line).

**This is very likely the same root cause as the existing "the first `Mod-j` after a completion
tooltip is silently refused — re-nudge" gotcha** — `moveCompletionSelection` carries the *identical*
guard. If so, the re-nudge advice works only because the retry happens to land past 75ms, and the
better fix is the delay.

Port: `COMPLETION_INTERACTION_DELAY_MS = 300` in `support/custom-column-2.ts`, applied before an
accepting Enter and before a completion click, plus a line-count invariant across the Enter so a
refusal fails loudly instead of corrupting the formula. **This is not an invented flake sleep** —
upstream's own helper does exactly this (`cy.wait(300)` in `acceptCompletion`, `selectCompletion`
and `{nextcompletion}`, commented "Avoid flakiness with CodeMirror not accepting the suggestion
immediately"). Cypress otherwise gets past 75ms for free because every `cy.realPress` is its own
command.

## 🟡 Finding 2: the harness runs **1280×720**, not Cypress's 1280×800 — and it changed a click outcome

`e2e/support/config.js:301` pins Cypress to `viewportWidth: 1280, viewportHeight: 800`.
`e2e-playwright/playwright.config.ts:46` declares the same `viewport: { width: 1280, height: 800 }`
at the **top level**, but the `chromium` project spreads `devices["Desktop Chrome"]`
(`playwright.config.ts:52`), whose `viewport` is **1280×720** — and project-level `use` wins. So
**every landed port runs 80px shorter than upstream**, silently.

Measured, same backend, same spec, viewport the only variable:

| viewport | expression-editor popover box | "Pick columns" button box | click |
|---|---|---|---|
| 1280×**720** | `{x:47, y:26, w:688, h:326}` (flipped **above** the anchor) | `{x:145.6, y:193, w:36, h:37}` | **FAILS** — `.cm-content` intercepts pointer events |
| 1280×**800** | `{x:47, y:402, …}` (opens **below**) | same | **OK** |

That single 80px difference broke 4 of the 8 `> exiting the editor` tests on run 1 in a way that
looks exactly like port drift. Fixed locally with `page.setViewportSize({width:1280, height:800})`
in that describe's `beforeEach` (documented inline). **Not** fixed in the shared config — I don't
edit shared files — but this looks like a latent harness defect worth a consolidation pass: the
top-level `viewport` in `playwright.config.ts` is dead code today.

## 🟡 Finding 3: two upstream assertions are non-discriminating, proven by presence probes

### 3a. `findByPlaceholderText("Enter a number").should("not.exist")` cannot fail from a wrong type

Three tests in `> data type` assert the numeric filter widget is absent to prove the custom column
isn't numeric. Mutating `concat([Category], [Title])` → `[Price]` (an unambiguously numeric column):

- `Enter a number` `toHaveCount(0)` — **still passed**.
- Follow-up presence probe under the *same* mutation: `toHaveCount(1)` — **failed**. The placeholder
  never appears at all for a numeric custom column in this picker.

So this is not the "absence check sampled too early" failure mode; the string simply never renders
on either branch. The check is **weak but not a timing artefact**, and the same holds in Cypress —
it is vacuous *upstream*, not port drift. I did not determine what the numeric branch renders
instead and am not going to guess. Ported verbatim with the analysis inline; the sibling
assertions (`Enter some text` visible, `Relative date range…` present) are the ones carrying these
tests and both die under mutation.

### 3b. The last test's two closing assertions assert nothing

`should be possible to close the popover when navigating away…` ends with:

```js
H.modal().should("not.exist");
cy.get("popover").should("not.exist");
```

- `cy.get("popover")` is a **tag selector** for a `<popover>` element type that does not exist in
  HTML or in this app. Vacuous by construction; it is *not* `H.popover()`. Ported verbatim with an
  inline `UPSTREAM DEFECT` comment.
- `H.modal().should("not.exist")` — presence probe (`toHaveCount(1)` under the unmutated flow)
  **failed**: no `[role=dialog][aria-modal=true]` ever exists on this path. So that assertion is
  also non-discriminating here. Net: this test is a smoke test that the click sequence completes.
  Recorded, not strengthened.

## 🟡 Finding 4: two upstream log/assert mismatches (ported verbatim)

- `metabase#15891`: `cy.log("Pressing \`escape\` key should also remove the expression helper
  popover")` is followed by `H.CustomExpressionEditor.blur()`, not an Escape. **Escape is never
  exercised by that test.**
- `should be possible to prefer showing the suggestion when typing`: `cy.log("help text should
  remain shown after finishing typing")` is followed by `assertNeitherAreVisible()`. The assertion
  is the correct one for the test's name; the log is stale.

Both are flagged inline in the port rather than silently corrected.

---

## Fixes applied while stabilising (feedback-loop classification)

| # | symptom | cause | class |
|---|---|---|---|
| 1 | `#15891` — help text never appears | `{enter}` refused by `interactionDelay`, inserted a newline instead of accepting `round` | **new gotcha** (Finding 1) |
| 2 | `close the help text` flaky | option click also subject to `interactionDelay`; upstream's `cy.wait(300)` had been "optimised away" into a visibility gate | **new gotcha** (same root cause) |
| 3–6 | 4 × `Pick columns` click intercepted by `.cm-content` | viewport 720 vs upstream 800 flips the popover above its anchor | **new gotcha** (Finding 2) |

## Mutation testing

**20 mutants + 2 presence probes, across all five describes. Every mutant died.** Mutations invert
the **input** (formula / column / clicked control), never the expectation.

| # | test | mutation | died at |
|---|---|---|---|
| M1 | string functions #13217 | `concat([Category],[Title])` → `[Price]` | tail: `Enter some text` visible — **not** the preceding absence check (→ Finding 3a) |
| M2 | relay type of date field | `[Birth Date]` → `[Latitude]` | `Relative date range…` click — again **not** the absence check |
| M3 | not appear outside a function | `lower([Category])` → `lower([Category]` | `helpTextHeader` count 0 |
| M4 | #15891 | `rou{enter}…` → `low{enter}…` | tail: `toContainText("round([Temperature])")` (the `toBeVisible` passed) |
| M5 | discard by cancel button | click `Cancel` → `Done` | tail: `"OK"` pill count 0 |
| M6 | string functions #13217 | *presence probe* under `[Price]`: `Enter a number` `toHaveCount(1)` | **failed → absence check is non-discriminating** |
| M7 | relay type of date field | `Previous` → `Current` | tail: `findByDisplayValue("days")` |
| M8 | non-existent field reference | `abcdef` → `[Category]` | `Unknown column` |
| M9 | expression validation errors | `SUBSTRING('foo',0,1)` → `(…,1,1)` | `positive integer` |
| M10 | #16126 | `{movetoend}{backspace}` → `{movetoend}2` | `Expected expression` |
| M11 | `> visibility` beforeEach | `round(` → `round()` | 5/5 tests in the describe |
| M12 | Escape when not empty | don't type `count(` | editor `toBeVisible` |
| M13 | exit when no text | enter `1+1` first | `modal` count 0 |
| M14 | unsaved expression | `Keep editing` → `Discard changes` | widget `toHaveCount(1)` |
| M15 | #15734 + #16127 | beforeEach name `Math` → `Mathz` | `findByDisplayValue("Math")` in both |
| M16 | understand date functions | `year([Created At])` → `year([Created At], 1)` | **`Done` click (bad mutation — see below)** |
| M17 | appear while inside a function | `lower(` → `lower` | `helpTextHeader` visible |
| M18 | #17548 | `helpText().click()` → `expression-name.click()` | **name-input click timeout (bad mutation)** |
| M19 | #17548 (redo) | `helpText().click()` → `helpTextHeader().click()` | tail: `helpText` still visible |
| M20 | exit by interactive element | enter `1+1` first | `modal` count 0 |
| M21 | discard when clicking outside | `Discard changes` → `Keep editing` | widget `toHaveCount(0)` |
| M22 | navigating away | *presence probe*: `modal` `toHaveCount(1)` | **failed → assertion non-discriminating** (Finding 3b) |

### My own bad mutations, called out

- **M16 was a bad mutation for its target.** I wanted to prove the `visualize()` tail is
  load-bearing; making a formula invalid instead disabled the **Done** button, so the mutant died in
  the helper before `visualize()` was ever reached. It proves the `Done` click is load-bearing, not
  the dataset wait.
- **M18 was a bad mutation.** Clicking `expression-name` instead of the help text timed out (the
  input isn't clickable at that moment), so the mutant died on an *interaction*, not an assertion.
  M19 (click the help-text **header**, which legitimately toggles it closed) is the correct
  discriminating mutant and killed the tail properly.

### Assertions left unproven, stated plainly

- **`should understand date functions` — `visualize()` is a weak tail.** Upstream `H.visualize()`
  (`e2e/support/helpers/e2e-notebook-helpers.ts:53-65`) is `cy.button("Visualize").click()` +
  `cy.wait("@dataset")` with **no status assertion** when no callback is passed (this test passes
  none), and our port matches (`waitForResponse` resolves on any status). So the test proves 13
  custom columns can be *created* and a dataset request round-trips — not that the query succeeded.
  I could not construct a mutation that is FE-valid and DB-invalid, so: **not triggered by any
  failure mode I could induce.** Faithful, weak, recorded — not strengthened.
- **`#15734` / `#16127` `Done` still-enabled tails.** These duplicate the `beforeEach` gate, so any
  input mutation dies in `beforeEach` first. The load-bearing assertion in both is the
  name-survival check, which M15 killed.

## Pinned values and CI-drift risk

This spec has **no pinned numeric/row-level results at all** — no result-grid cells, no row counts,
no computed column values are asserted anywhere. So the usual "data-derived assertions differ on the
CI merge jar" class is largely absent here. What *is* pinned is FE-authored copy, which is the drift
class that applies (the local jar is the Jul-18 merge commit `751c2a98`; CI builds a fresh merge
with master):

| pinned string | source | drift risk |
|---|---|---|
| `round([Temperature])` | expression help-text **example** in the FE clause catalogue | **highest** — asserted 4× (#15891 ×2, #17548 ×2); a copy edit to the example breaks all four |
| `lower(value)` | help-text **structure** line | medium — asserted 2× |
| `Unknown column: abcdef` | expression diagnostics | medium |
| `Expected positive integer …` / `positive integer` | expression diagnostics | medium |
| `Expected expression` | expression diagnostics | medium |
| `Keep editing your custom expression?` | `CloseModal.tsx:17` | low |
| `Relative date range…`, `Previous`, `days` | filter picker copy | low |
| `Enter a number` / `Enter some text` | filter widget placeholders | low, **and already non-discriminating** (Finding 3a) |
| `Custom column`, `Pick columns`, `Select all`, `Summarize`, `Custom Expression`, `View SQL` | notebook / view-header copy | low |
| `QA Postgres12`, `Orders`, `People`, `Products` | QA-DB fixture + snapshot names | low |
| column refs `[Category] [Title] [Birth Date] [Discount] [Created At] [Product → Created At] [Rating]` | sample DB schema | low |

No fixture ids or field names were guessed — every table is reached by `SAMPLE_DATABASE` constant or
by picker text, and every testid asserted on (`expression-editor`, `expression-name`,
`expression-helper`, `expression-helper-popover-structure`, `custom-expression-query-editor`,
`custom-expression-editor-suggestions`) was grepped and confirmed present in `frontend/src`.

## Fixmes

**None.** All 28 tests are ported and green; nothing is skipped except by the `@external` gate.
No Cypress cross-check was run (standing rule — sibling slots are live), so I cannot say whether
upstream behaves identically; nothing in this port needed that claim.

## Summary (3 lines)

Ported 28/28 tests green (56/56 under `--repeat-each=2`) against the CI jar `751c2a9`, with the
`@external` describe correctly gated — gate-OFF control: 23 executed, 5 skipped; tsc clean; spec
restored byte-identical (md5 `f4c32812233def63ec9ad385e0e0af72`) after 20 mutants + 2 presence probes,
all mutants killed, two of them my own bad mutations which I redid.
Two new mechanisms named and measured: `@codemirror/autocomplete`'s 75ms `interactionDelay` makes an
immediate Enter/click a **silent newline-inserting no-op** with no DOM signal to gate on (likely the
real cause of the existing "first Mod-j is refused" gotcha), and the harness runs **1280×720** because
`devices["Desktop Chrome"]` overrides `playwright.config.ts`'s own 1280×800, which flips the expression
popover above its anchor and broke 4 tests.
Three upstream assertions are non-discriminating and were ported verbatim with analysis rather than
strengthened: the `Enter a number` absence checks (proven by a presence probe), `cy.get("popover")`
(a `<popover>` tag selector), and `H.modal().should("not.exist")` on a path where no modal ever exists.
