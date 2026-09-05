# question-notebook (slot 4 / :4104)

Source: `e2e/test/scenarios/question/notebook.cy.spec.js` (1245 lines, 34 `it`s)
Target: `e2e-playwright/tests/question-notebook.spec.ts` (+ `support/question-notebook.ts`)
Artifact: local CI uberjar `target/uberjar/metabase.jar` (COMMIT-ID `751c2a98`, 2026-07-18).
Branch spec is **identical to origin/master** (`git diff HEAD..origin/master` on the spec: empty),
so the "CI merge-commit drift" class does not apply here.

## Executed vs gate-skipped (with the gate-OFF control)

| run | executed | gate-skipped | upstream `@skip` |
|---|---|---|---|
| `PW_QA_DB_ENABLED=1` | **33** | 0 | 1 |
| gate OFF (control) | **30** | **3** | 1 |

The 3 that flip are the `@external` `"median" aggregation function` describe. `--repeat-each=2`
with the gate on: **66 passed / 2 skipped** (the `@skip` ×2). `bunx tsc --noEmit` clean.

## Container evidence — the QA-DB path really ran

`postgres-12` pins database 2 ("QA Postgres12") to the **`sample`** database on
`localhost:5404`, *not* `writable_db` (an easy wrong turn: `WRITABLE_DB_CONFIG.postgres`
points at `writable_db`, which has no `public.products` at all — my first probe returned `[]`
and looked like "the container isn't there").

Read-only `pg_stat_user_tables` around a run of just the 3 median tests:

```
BEFORE  products seq_scan=23  seq_tup_read=4600   people seq_scan=25 seq_tup_read=60005
AFTER   products seq_scan=26  seq_tup_read=5200   people seq_scan=25 seq_tup_read=60005
```

+3 sequential scans (one per test) and +600 tuples (3 × the 200-row `products` table), with
`people` unmoved. `relfilenode` unchanged (16426) — these tests only read, so no drop/recreate
signal is expected here; the seq_scan delta is the equivalent proof. **No container state was
mutated** (siblings live).

## FINDING — metabase#16787's assertion is VACUOUS UPSTREAM (surviving mutant, then fixed)

Upstream:

```js
cy.findByText("User ID").findByLabelText("Binning strategy").should("not.exist");
cy.findByText("User ID").findByLabelText("Temporal bucket").should("not.exist");
```

`findByText` resolves the row's `<heading>`; the bucket button is that heading's **sibling**
inside `[data-testid=dimension-list-item]`. So the inner query can never match — for *any*
column. Measured on the same open popover (probe run, jar mode):

```
heading-scoped  "Total"      / Binning strategy  -> 0     <-- and Total DOES have one
row-scoped      "Total"      / Binning strategy  -> 1
row-scoped      "Created At" / Temporal bucket   -> 1
row-scoped      "User ID"    / Binning strategy  -> 0
row-scoped      "User ID"    / Temporal bucket   -> 0
```

A mutant that swapped the target column to the binnable **Total** *survived* the literal port
(green), and **dies** against the row-scoped form. Cypress has the same `.within`-style
semantics, so this is vacuous upstream too — not port drift. Ported with upstream's heading
locator kept as the existence anchor and the absence assertion re-scoped to the row, which is
what 16787 actually claims. `frontend/.../QueryColumnPicker.unit.spec.tsx:138` independently
confirms Total renders the label.

Worth a sweep: any Cypress `findByText(x).findByLabelText(y).should("not.exist")` has this
shape whenever `y` is a sibling of the text node rather than a descendant.

## Mutation testing — 11 mutants, all resolved

Input inverted, never the expectation. Where each died:

| # | test | mutation | result |
|---|---|---|---|
| A | post-aggregation filters | type `45` not `46` | killed at the **tail** (`"2372"`) |
| B | previews 28726/29959 | second limit `3` not `50` | killed at the **last** `assertTableRowCount(10)` |
| C | 63070 | vacuity probe: `toHaveCount(0)` → `(1)` | fails ⇒ locator really resolves 0 |
| C-probe | 63070 | same locator in the **normal** table view | **19** matches ⇒ the absence check is not a dead locator |
| C2 | 63070 | Products instead of Orders | killed at the anchor (`37.65`) |
| D | median: percentile feature | aggregate `Rating`, assert `Price` | killed mid (notebook-step label) |
| D2 | median: percentile feature | drop the `Switch to data` click | killed at the **tail** header-cell assertion |
| E | 46832 | drop the second join | killed mid |
| E2 | 46832 | drop the **final** `Summaries` click | killed at the **tail** assertion |
| F | 13470 | skip the initial save (question is dirty) | killed at the **absence** assertion ⇒ not vacuous |
| G | 16787 | group by binnable `Total` | **SURVIVED** → see finding above; kills after the fix |
| H | 40553 | rename the metric | killed at the tail `[Revenue]` value assertion |
| I2 | 48358 | third aggregation `Rating` not `Price` | killed at the **third** SQL assertion (`sum_3`) |

Note on I2: with the mutation applied the *first* SQL assertion also timed out until a settle
was added — the View-SQL panel recompiles asynchronously and 10s wasn't always enough **under
the mutant**. The unmutated test is stable (2/2 under `--repeat-each=2`); flagging it as a
plausible future CI-load flake in `should not leave the UI in broken state (48358)`.

## Port gotchas hit (candidates for PORTING.md)

1. **`H.NativeEditor.get(".ace_line")` discards its argument.** `codeMirrorHelpers.get()`
   takes none, so 48358's three `include.text` assertions run against the whole CodeMirror
   content. (Another instance of the "read the helper's SIGNATURE" rule; and `.ace_line` is
   dead DOM — the editor is CodeMirror.)
2. **A real hover reveals an overlay that then eats the click** — `H.popover().icon("int").click()`
   in "post-aggregation filters". Playwright's mouse crosses the dimension row on the way in,
   the row's hover-revealed "More info" icon renders **on top of** the type icon, and the click
   is intercepted. `dispatchEvent("click")` is the faithful port (Cypress dispatches at the
   resolved element). This is the FINDINGS-#… force-click rule in its *inverse* form: the
   overlay is created **by the hover the click itself performs**, so nothing in the pre-click
   DOM predicts it.
3. **Bucket buttons in the breakout picker have no layout box until the row is hovered.**
   Upstream `findByRole("option",{name}).findByText("by month").realHover().click()` works
   because `realHover` doesn't need visibility; Playwright must `hover()` the **option row**
   first, then act on "by month" / "Auto bin". (metabase#45036.)
4. **`H.CustomExpressionEditor.completion()` is an OVERRIDE, not the CodeMirror one.** The base
   `codeMirrorHelpers.completion` uses `.cm-completionLabel`, which does not exist in the
   custom-expression editor at all (its `Listbox` renders `<li role="option">`). Porting the
   base implementation matches nothing. Use the shared `customExpressionCompletion`
   (custom-column-3.ts) — it is already the override's shape.
5. **`Switch to data` needs `click({ force: true })`** here — confirms the briefed
   `QuestionDisplayToggle` gotcha (segments are `disabled: true`, the root carries `onClick`).
   Note several landed specs call it with a plain `.click()`; those sites are presumably in a
   state where the toggle is enabled, but it is a latent difference.
6. **"Edit metadata" carries a completeness badge**, so `popover().getByText("Edit metadata",
   {exact:true})` (the shared `openQuestionActions`) matches nothing on a model. Use
   `openQuestionActionsItem(page, /Edit metadata/)` (models-reproductions-2.ts) — already
   documented there, re-confirmed by 55162.
7. **`cy.findByRole("button", { name: "Cancel", hidden: true })` + `{force:true}`** (50971): the
   dataset edit bar is inert behind the data-picker modal, so Playwright's `getByRole` (which
   excludes aria-hidden) finds nothing. Ported as a `locator("button")` + `dispatchEvent("click")`.

## Not done / scope caveats

- **No Cypress cross-check** — declined per the brief: `H.restore()` re-points database 1 at the
  shared `e2e/tmp` H2 file and would break the four sibling slots. Nothing in this port rests on
  a cross-check: there are no fixmes and no product-bug claims.
- Verified only against the **local** jar (2026-07-18). No data-derived magic numbers were pinned
  beyond what upstream already asserts (`Showing 98 rows` / `175 rows` / `2372` / `37.65`), all of
  which come from the sample DB and are unchanged upstream.
- `res.setThrottle(500)` (17397) is ported as a 1000ms `page.route` delay. It is a *timing widener*
  in both harnesses, not an assertion — the retrying row-count checks would pass without it. Not
  inversion-probed at a larger delay because no assertion depends on the delay's magnitude.
