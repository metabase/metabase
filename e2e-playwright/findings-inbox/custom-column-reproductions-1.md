# custom-column-reproductions-1 (slot 1, :4101, QA-DB tier)

Source: `e2e/test/scenarios/custom-column/custom-column-reproductions-1.cy.spec.js` (1393 lines)
Target: `e2e-playwright/tests/custom-column-reproductions-1.spec.ts`
Helpers: `support/custom-column-reproductions-1.ts` (new; no shared module touched)

## Summary (3 lines)

31 tests ported 1:1 across 25 independent regression describes; **24 executed / 7
gate-skipped** with `PW_QA_DB_ENABLED=1`, and the gate-OFF control drops to
**22 executed / 9 skipped** — so both QA-Postgres tests genuinely ran, not
green-by-skipping. Green 24/24, then **48/48 under `--repeat-each=2`**, `tsc` clean.
**9 of 9 mutants killed**, five of them aimed at *tail* assertions (the QA-DB
container fixture, the last line of a 100-line test, etc.) so the tails are proven
load-bearing, not just the first assertion.

## Executed vs skipped

| run | passed | skipped |
|---|---|---|
| `PW_QA_DB_ENABLED=1` | **24** | 7 |
| gate OFF (control) | 22 | 9 |
| `PW_QA_DB_ENABLED=1 --repeat-each=2` | **48** | 14 |

The 7 always-skipped are upstream `@skip` tags, ported in full and declared
`test.skip(true, …)`: 12445 (also `@external`, mysql-8), 14517 (also `@external`),
25189, 42949 ×3, 49882-3. The 2 gate-sensitive ones are 13751 (`postgres-12`) and
27745 (`postgres-writable`).

## Container evidence (the QA-DB path really ran)

`docker exec metabase-e2e-postgres-sample-1 psql -U metabase -d writable_db` after the run:

```
 public | colors27745 | table | metabase
 id | name
  1 | red
  2 | green
  3 | blue
```

Proven, not assumed: the **fixture mutation** (a 4th seeded row) flipped
27745's assertion from `55` to `80`. The container is in the assertion path.

### FINDINGS #85 debris IS present on this box

`pg_namespace` on `writable_db` currently carries `public`, `Domestic`, `Wild`,
and **`Schema A` … `Schema Z`**. It did not bite this spec — 27745 only reads
`public.colors27745` through `/api/search` — but note that
`POST /api/database/2/sync_schema` here syncs all 29 schemas, which is precisely
why the sync needs a real gate (below). Nothing was dropped.

## Fixes needed (classified per the feedback-loop rule)

### New gotchas (worth adding to PORTING.md)

1. **🔴 `page.keyboard.press(key, { delay })` is the keydown→keyup HOLD, not a gap
   between presses.** Porting Cypress's `cy.realPress` loop as
   `press(k, {delay: 25})` still fires the presses back-to-back. Measured in the
   completions popup: 5 `ArrowDown`s advanced the selection by **2**. The fix is a
   real `await page.waitForTimeout(25)` *after* each press. The wave-9 "pace
   repeated key presses" rule is right about the cadence and wrong about the
   mechanism — `keyboard.type`'s `delay` IS inter-character, `keyboard.press`'s is
   not.

2. **🔴 An `{Enter}` inside a Cypress formula string is a COMPLETION ACCEPT, and
   needs the 300ms settle.** `H.CustomExpressionEditor.acceptCompletion` waits
   300ms after asserting the popup is visible; typing `{enter}` inline via
   `.type()` gets that latency for free from Cypress's command queue. Ported
   literally, CodeMirror inserts a **newline** instead of accepting — `[Tot` +
   Enter yielded `"[Tot\n  ]"`, not `"[Total] "`. This hit **4 tests** (49342,
   49882-1, 50925 ×2) with four different-looking fingerprints. Asserting the
   popup is visible is NOT enough on its own; the 300ms is load-bearing.

3. **🔴 `QuestionDisplayToggle`'s two SegmentedControl options are `disabled: true`
   BY DESIGN** (`QuestionDisplayToggle.tsx`) — the component drives the toggle from
   the control root's `onClick` and disables the radios so native radio behaviour
   can't interfere. Cypress clicks the label's `<svg>` and the event bubbles;
   Playwright's actionability sees the disabled input and hangs the full 30s with
   *"element is not enabled"* on a fully-rendered, correctly-answered page
   ("Showing 2 rows, 43ms"). `click({ force: true })` is correct here. **Any port
   calling `findByLabelText("Switch to data")` has this**, and the fingerprint reads
   like the query never finished.

4. **The notebook data step's search input is autofocused and lives OUTSIDE
   `[data-testid=mini-picker]`.** `H.miniPicker().within(() => cy.realType("colors"))`
   is misleading: `realType` types at `document.activeElement`, so the `.within()`
   scope is decorative. Measured: `document.activeElement` after the picker opens is
   `INPUT placeholder="Search for tables and more..."`, and
   `miniPicker.getByRole("textbox")` matches **nothing** (`showSearchInput` defaults
   false — `MiniPickerItemList.tsx:548`). Port as: assert that input is focused, then
   `page.keyboard.type(...)`.

### Measured timing observation — recorded, NOT a product-bug claim

For 49882-4, the completions list is **recomputed asynchronously shortly after it
first paints, and CodeMirror resets the selection to index 0** when the recompute
lands. Dumping `aria-selected` after every `ArrowDown` with a 300ms settle:

```
0 → 1 → 0 → 1 → 2 → 3        (3/3 runs — the reset fires mid-sequence)
```

With a 1s settle: `0 → 5` deterministically (5/5 runs), i.e. the state upstream's
slower per-command cadence actually measures. The port waits 1s and documents the
measurement. **I am not claiming this is a bug**: I did not run the Cypress
cross-check on it, and the same app code serves both harnesses, so this is a
statement about *when* the presses land, not about whether the app is wrong. It is
suggestive given the test's own title ("should update currently selected suggestion
when suggestions list is updated") and is worth a look by someone who owns the
feature.

### Known gotchas the brief already covered (confirmed, cost ~0)

- `resyncDatabase({dbId})`-with-no-`tables` hole: avoided. Upstream's 27745 fires
  `POST /api/database/2/sync_schema` and never waits; the port polls
  `/api/search?models=table` until `colors27745` is searchable, which is the thing
  the test actually reads.
- `click({force:true})` → `dispatchEvent("click")` for the three Cypress
  `{force:true}` dispatches (18747 parameter mapping, 19745 "Remove step",
  20229 column uncheck).
- MultiAutocomplete/`PillsInput` blur trap before "Add filter": pre-emptively
  `blur()`ed in 13751 / 14843 / 18747 / 49304. No failures observed.

## Upstream observations (not bugs, just recorded)

- **27745's `cy.wait("@dataset")` enforces nothing.** That describe never registers a
  `dataset` alias; the one in scope was registered by `H.visualize()` earlier, and
  `cy.wait` consumes *past* responses — so it is satisfied retroactively by the
  visualize query, not by the Sum re-run. Dropped in the port; the retrying
  `scalar-value` assertion is the real gate (and it kills the fixture mutant).
- **18747's `PUT /api/dashboard/:id { cards: [...] }` is a no-op** — the current API
  takes `dashcards`, not `cards`. Ported literally (it changes nothing either way).
- **19744 depends on the save modal defaulting to a dashboard.** `H.saveQuestion("19744")`
  with no `pickEntityOptions` files the question into a dashboard and lands there in
  edit mode, which is why `H.setFilter` and `getDashboardCard(1)` work at all. It
  passes, but it is coupled to a default, not to anything the test states.

## Mutation testing — 9/9 killed

Inputs inverted, never expectations. **Where** each died is recorded, because a
mutant that dies at assertion #1 proves nothing about assertions #2..n.

| # | test | mutation (input) | died at |
|---|---|---|---|
| 1 | 27745 | 4th row in the **QA-DB container fixture** (`colors27745`) | `scalar-value` `55` → `80` — the only assertion that reads the DB |
| 2 | 18069 | `CC_ScaledRating` `*1.5` → `*2.0` | final `1,041.45` (**tail**, after 8 popover assertions) |
| 3 | 14843 | expression column `PEOPLE.CITY` → `PEOPLE.NAME` | **last line** — `"Rye"` absence; the filter-text assertion above it correctly still passed |
| 4 | 21135 | `Price + 2` → `Price + 3` | `31.46` (**tail**); `Rustic Paper Wallet` and the 2×`Price` count passed above it |
| 5 | 49305 | `concat("49305 ", …)` → `"49306 "` | inside `assertTableData` (**tail**, after `verifyNotebookQuery`) |
| 6 | 49304 | final formula re-adds `"case-insensitive"` | **very last assertion** of a ~110-line test (`Case sensitive` checked) |
| 7 | 18747 | CC mapped to `ORDERS.TOTAL` instead of `QUANTITY` (name unchanged, so every UI step is identical) | row count `1` → `0` |
| 8 | 41305 | `contains(` → `contains` | the right-click target (`"The column or text to check."`) |
| 9 | 53527 | `replace([TEXT], "\"", "")` → `replace([TEXT], "z", "")` | final `"ab"` visible |

Honest note on #8: the `toHaveCount(2)` popover assertion **survived** this mutation
(the function help-text popover renders for a bare `contains` too), so it was a
partly-bad mutation — the test still died, at a real assertion, one step later. The
`toHaveCount(2)` pair in 41305 is therefore proven non-vacuous only in the sense
that 2 popovers really do exist; I did not find a mutation that isolates it.

Not separately mutated, so **unproven tails**: 49882-2's trailing error-text
assertion (`"Expecting operator but got case instead"`) — every mutation I could
construct there kills the preceding `value()` assertion first.

## tsc

`bunx tsc --noEmit` is clean **for my files**. Two pre-existing errors in a sibling
agent's in-progress `tests/admin-datamodel.spec.ts` (`DataModel.…getNameInput` does
not exist) are unrelated to this port and were present before I started.

## Housekeeping

- No shared support module edited; everything spec-local is in
  `support/custom-column-reproductions-1.ts`.
- `PORTED.txt` / `QUEUE.md` / `build-helper-index.mjs` untouched; nothing committed.
- Scratch files and the private `--output` dir removed.
