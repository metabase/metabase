# custom-column-reproductions-2

Source: `e2e/test/scenarios/custom-column/custom-column-reproductions-2.cy.spec.js` (993 lines)
Target: `e2e-playwright/tests/custom-column-reproductions-2.spec.ts`
Helpers: `e2e-playwright/support/custom-column-reproductions-2.ts` (new, per-spec; no shared module edited)
Slot 3 / :4103, jar `751c2a9` == `target/uberjar/COMMIT-ID` `751c2a98` (verified via `/api/session/properties`).

## Collision checks

- Source dir `ls`: exactly one `custom-column-reproductions-2` file, the `.js`. The `.ts` siblings there
  are `cc-boolean-functions`, `cc-fields`, `cc-literals`, `cc-shortcuts*` — no same-basename `.js`/`.ts` pair.
- `ls tests/`: no `custom-column-reproductions-2.spec.ts` existed. (`custom-column-reproductions-1`,
  `custom-column-1`, `custom-column-3`, `cc-*` all present and untouched.)

## Infra tier — what it ACTUALLY is

**Almost entirely tier-0 (no container).** 15 of 16 describes restore the plain `default` snapshot and
drive the H2 sample DB. Exactly **one** describe is a container test: `Issue 38498` (`@external`,
`H.restore("postgres-12")`, QA Postgres12). It is gated on `PW_QA_DB_ENABLED` and **executes** here — the
QA Postgres12 database is present, so this is real container coverage, not a skip.

No writable-DB work at all (#85 does not apply): nothing in this spec creates or lists tables/schemas.

## Executed vs skipped

| run | passed | skipped | notes |
|---|---|---|---|
| `PW_QA_DB_ENABLED=1` | 30 | 2 | 2 skips = upstream `@skip` (58371, 57674-first) |
| `PW_QA_DB_ENABLED=1 --repeat-each=2` | 60 | 4 | final run, after all fixes |
| **gate-OFF control** | 29 | 3 | the extra skip is 38498; nothing else changes, no `afterEach` fallout |

`bunx tsc --noEmit` clean.

## Fixes needed (all port drift, classified)

1. **Known gotcha, mis-scoped in my first draft — `H.CustomExpressionEditor.focus()` is
   `click("right", { force: true })`.** The `force` is load-bearing: the editor's own portalled overlays
   (`[data-testid=expression-helper]`, the completions listbox) sit ON TOP of `.cm-content`. The shared
   `focusCustomExpressionEditor` (custom-column-3.ts) uses a real click, so **5 tests** burned 30s each on
   `"… subtree intercepts pointer events"` against a completely correct page. Fixed with a local
   `focusEditor` built on `dispatchClick` (a real dispatch, Cypress semantics). Same root cause fixed
   `Issue 63180`'s "click outside the editor" and `26512`'s per-iteration `clear()`.
   Feedback: this is PORTING's `click({force:true}) ≠ Cypress {force:true}` rule; worth noting that it
   also applies to the *focus* helper, which reads like a neutral utility.

2. **New gotcha — a completion row needs a REAL click AND a settle.**
   - Real vs dispatched: a dispatched `mousedown` on the `li[role=option]` reaches `document` (verified
     with a capture-phase counter: it incremented) yet React's `onMouseDown` never applies the
     completion — document stayed `"Coun"`, while a **real** click on the same locator moments later
     produced `"CountIf(condition)"`. Both dispatch flavours failed (Playwright's `dispatchEvent` and a
     hand-built `MouseEvent`). **I could not explain this from the React portal-listener model and am
     recording it as measured-but-unexplained rather than inventing a mechanism.** It is the reverse of
     the usual "dispatch beats real click" rule.
   - Settle: without one, the second click in 62987 left the document at `"CountIf(notEm)"` with **no
     error** — it silently applied nothing. Upstream has exactly this wait in
     `codeMirrorHelpers.selectCompletion` (`cy.wait(300)`, "Avoid flakiness with CodeMirror not accepting
     the suggestion immediately"); the test under port relies on Cypress's queue latency for it.
     Consistent with `@codemirror/autocomplete`'s `interactionDelay` — inference, not measured.

3. **New gotcha — the outside-click that must CLOSE the editor needs the clear to have landed.**
   `Issue 63180` closes the widget only once the expression is empty, and CodeMirror's state update is a
   React render behind the keystroke. Failed 1 of 2 runs before I gated on
   `expectCustomExpressionValue(page, "")`. Cypress's command queue supplied that settle.

4. **`allowFastSet: true` is not "type faster".** It is
   `get().invoke("text", text)` — replacing the editor's `textContent` wholesale — followed by
   `type(" {backspace}")` to nudge the validator. Re-typing those formulas for real would fire
   close-brackets/autocomplete and build a different document. Ported literally (`fastSetExpression`),
   used by 57674 and 26512 (21 formulas).

5. **Duplicate `it` titles in Issue 12938** (two tests, byte-identical titles). Hard load error in
   Playwright; the second is suffixed `— hour/minute variant`, subject unchanged.

6. **31964's bare `cy.realPress("Enter")`.** I initially guarded it with "the completions popup is
   closed" — **that guard was wrong**: the popup IS open (measured). Enter still inserts a newline
   because no option is selected, so CodeMirror's `acceptCompletion` declines. The *following*
   `cy.realPress("Tab")` genuinely is a completion accept and needs the 300ms settle.

7. **54638 navigates to metabase.com.** The docs origin is stubbed with an empty 200 so the run does not
   depend on the public internet. The URL assertion — the entire subject — is untouched, and mutation M1
   proves it is load-bearing.

## Mutation testing — 15 mutants, 12 killed, 3 survivors

Applied in one run, one mutant per test, always inverting the **input**.

| # | test | mutation | result | died at |
|---|---|---|---|---|
| M1 | 54638 | `case(` → `datetimeDiff(` | killed | the URL wait (**tail**), not "Learn more" visible |
| M2 | 54722 | drop the filter block's `openCustomExpression` | killed | 2nd focus assertion (**tail**) |
| M3 | 31964 | `[Product -> Categ` → `[Product -> Vend` | killed | expression value |
| M4 | 55686 | `not` → `su` | killed | first completion assertion |
| M5 | 55940 | `Offset(` → `Sum(` | killed | `toContainText("Offset(Sum([Total]), -1)")` (**tail**), not `toBeVisible` |
| M6 | 55984-1 | 88-char name → `"Lo"` | **survived** | see below |
| M7 | 55622 | `max([Birth Date])` → `[Birth Date]` | killed | `Done` click (before the row-count tail) |
| M8 | 56152 | multi-line → single-line formula | **survived** | see below |
| M9 | 56596 | drop `formatExpression()` | **survived** | see below |
| M10 | 55300 fields-1 | `{home}` → `{end}` | killed | 2nd `helpTextHeader` assertion (**tail**) |
| M11 | 26512 | all 21 formulas → valid ones | killed | "Types are incompatible" |
| M12 | 58230-3 | never type the aggregation name | killed | `toBeEnabled()` |
| M13 | 63180 | remove the outside-click that must close the widget | killed | `toHaveCount(0)` |
| M14 | 62987 | `notEm` → `notNu` | killed | completion visibility |
| M15 | 25189-2 | expression `"Created At"` → `"XCreated At"` | killed | `toHaveCount(2)` |

Deaths are well spread — five landed on tail assertions rather than clustering at assertion #1.

**M11 is worth calling out**: 26512 re-asserts the same error string across 21 loop iterations, which
looks like it could pass off a stale error from the previous iteration. It does not — all-valid formulas
fail the loop.

### Survivor analysis

- **M8 (56152) and M9 (56596): bad mutations, not vacuity.** M8 removes the multi-line discriminator, but
  help text is *correctly* shown for single-line expressions too; the ported test still types multi-line,
  so a multi-line-only regression is still caught. M9 removes `format()`, whose failure mode is "format
  eats the backslash" — with format fixed, the value is already right without it. Both assertions remain
  sound for the input as ported.

- **M6 (55984): genuinely vacuous — and vacuous UPSTREAM.** Not port drift.

## 🔴 Upstream vacuous assertion: `H.isScrollableHorizontally` under overlay scrollbars (issue 55984, ×2 tests)

`isScrollableHorizontally` (`e2e-ui-elements-overflow-helpers.js`) infers a horizontal scrollbar from the
layout height it *reserves*:

```js
const horizontalScrollbarHeight = offsetHeight - clientHeight - borderWidth;
return horizontalScrollbarHeight > 0;
```

Chromium here uses **overlay scrollbars**, which reserve **zero** layout height. Measured on the jar, by
forcing the completions dropdown's direct child to `width: 2000px`:

```
scrollWidth 2000, clientWidth 1197        → genuinely overflowing horizontally
offsetHeight 108, clientHeight 106, borders 2 → scrollbarHeight 0 → helper returns FALSE
```

So the helper returns `false` for an element that **is** scrolling horizontally, and both of issue
55984's tests assert something that cannot fail. Two weaker probes agreed (forcing `white-space: nowrap`
on every `li`, and `min-width: 2000px` on an `li`, both left `scrollWidth === clientWidth === 400`), and
mutation M6 — replacing the 88-character suggestion name with `"Lo"` — leaves the test green.

Cypress has identical semantics, so **this is vacuous upstream too**, on any platform with overlay
scrollbars (i.e. CI's headless Chromium as well).

**Action taken, stated explicitly per the hard rule:** the verbatim port
(`expectNotScrollableHorizontally`) is kept, and a direct measurement
(`expectNotOverflowingHorizontally`, `scrollWidth - clientWidth <= 0`) is added **alongside** it. The
intent is unambiguous and no security surface is involved. Both tests pass with the strengthened
assertion (60/60 under `--repeat-each=2`).

**Blast radius worth walking:** `isScrollableHorizontally` / `isScrollableVertically` are shared upstream
helpers. Any other spec asserting on them has the same hole. Not swept here.

## Container evidence

- `Issue 38498` (`@external`, QA Postgres12) **executed** — 2/2 under `--repeat-each=2` — and correctly
  skips with the gate off. This is the only container-dependent describe.
- No writable-DB (`writable_db` on :5404/:3304) use anywhere in this spec; #85's picker/schema-debris
  hazards do not apply.

## Summary (3 lines)

Ported 32 tests (30 executed + 2 upstream-`@skip`); 60/60 green under `--repeat-each=2` on the CI jar,
tsc clean, gate-OFF control 29 passed / 3 skipped. Real tier is one QA-Postgres describe over fifteen
container-free ones — and that one genuinely runs here.
15 mutants, 12 killed with five deaths on tail assertions; the one true survivor exposed an **upstream
vacuous assertion** — `isScrollableHorizontally` cannot ever report true under overlay scrollbars, so
both of issue 55984's tests were unfailable, now strengthened alongside the verbatim port.
