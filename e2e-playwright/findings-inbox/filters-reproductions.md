# findings — filters-reproductions (slot 5, port of `filters-reproductions/filters-reproductions.cy.spec.js`)

Source: `e2e/test/scenarios/filters-reproductions/filters-reproductions.cy.spec.js` (1194 lines, 29 describes)
Target: `e2e-playwright/tests/filters-reproductions.spec.ts` + `support/filters-reproductions.ts`
Backend: slot 5 (:4105), local CI uberjar `751c2a98` (verified: `version.hash` = `751c2a9`, `ps` shows `java -jar target/uberjar/metabase.jar`).

No prior port existed (`dashboard-filters-reproductions-1/-2` are different sources; not in PORTED.txt/QUEUE-done).

---

## 1. Infra tier — the classifier was wrong again (4th time)

**This is NOT a QA-DB spec.** 28 of 29 tests run entirely on the H2 sample DB
and need **no container at all**. Exactly **one** describe (issue 45252) is
`@external`, and it is the real thing: `restore("postgres-writable")` +
`resetTestTable({type:"postgres", table:"many_data_types"})` + a writable-DB
resync. Nothing here touches maildev or mongo.

Executed vs skipped, both arms measured:

| run | executed | skipped |
|---|---|---|
| gate ON (`PW_QA_DB_ENABLED=1`) | 28 | 1 (issue 26861, upstream `@skip`) |
| gate ON, `--repeat-each=2` | 56 | 2 |
| **gate OFF (control)** | 27 | 2 (26861 + 45252) |

The gate-OFF control is clean — the QA-gated test skips at its `beforeEach`
and nothing cascades (no `afterEach` in this spec, so the #67/#49 teardown
trap does not apply here).

## 2. 🔴 FINDINGS #85 reconfirmed — and it now *blocks* a port, not just flakes one

The shared writable postgres container is contaminated well past cosmetics.
Measured `GET /api/database/2/metadata` from slot 5:

```
Domestic.Animals, Schema A.Animals … Schema Z.Animals, Wild.Animals, Wild.Birds,
public.composite_pk_table, public.many_data_types      (31 tables, 29 of them debris)
```

Consequence for the mini picker, which upstream never sees: on a freshly built
`writable_db` there is only `public`, so the notebook picker **skips the schema
level** and clicking the database lists tables directly. With 28 debris schemas
it renders a **schema level instead** — and that list is **virtualized**, so
`public` sorts past `Schema Z` and is **not in the DOM at all**:

- `miniPicker.getByText("public", {exact:true}).count()` → **0**
- `scrollIntoViewIfNeeded()` → times out (nothing to scroll to)
- visible rows: `Domestic, Schema A … Schema P` (viewport-bounded)

This is precisely the "red" mode in the #85 note, observed end-to-end. It is
**not** survivable by a taller viewport. The port works around it in
`support/filters-reproductions.ts pickMiniPickerTable`: try the table directly
(the clean-container path, i.e. what upstream does), and only on failure wheel
the virtual list until `public` renders, click it, then the table. The schema is
**pinned to `public`** per the #85 rule, so a same-named foreign table cannot
win the lookup. No foreign schemas were dropped (siblings live).

**Recommendation:** the owed durable fix is now blocking, not theoretical. Any
future QA-DB port that navigates the data picker on `Writable Postgres12` will
hit this and will look like "the table didn't sync".

## 3. 🔴 Upstream vacuity: issue 50731 never inspects the tooltip it is named for

`"tooltip content should not overflow the tooltip (metabase#50731)"` does:

```js
cy.icon("label").realHover();
H.popover().should("be.visible").and(($element) => {
  const [container] = $element;              // ← FIRST visible popover
  container.querySelectorAll("*").forEach(d =>
    H.assertDescendantNotOverflowsContainer(d, container));
});
```

`H.popover()` is `cy.get(POPOVER_ELEMENT).filter(":visible")` — a **set**, in
document order — and `[container]` takes the first. Measured on the page under
test (both popovers match the identical selector string our port uses):

- `popover[0]` = the filter **column-list** popover (`Orders / ID / User ID / …`)
- `popover[1]` = the column-description **hovercard** the hover opens

So the assertion runs against the column list, and the hovercard — the entire
subject of the bug — is never looked at.

**Proven by mutation, not by reading:** deleting the `hover()` call outright
(so no hovercard is ever created) leaves the test **green in 1.6s**. A test
whose whole subject can be removed without it going red asserts nothing about
that subject.

Cypress has the same semantics, so **this is an upstream hole, not port
drift**. Per the hard rule the port is verbatim (`popover(page).first()`) with
the analysis inline; it is deliberately *not* silently strengthened to
`.last()`. Someone owning this spec upstream should re-point it at the
hovercard.

## 4. Gotchas hit (all already in PORTING; confirmations, not new)

- **`hover({force:true})` is the faithful port of `realHover()`** — 50731's real
  hover was refused: at the `.Icon-label` centre the sibling `.Icon-info` is
  topmost, and the retry loop then reported the row non-visible. Cypress
  hit-tests nothing. Same family as the pie-label / dense-ECharts-series rule,
  now seen on an ordinary icon list.
- **Never re-query a token field by placeholder mid-interaction.** Three tests
  (45410, 48851, 49321) type comma-separated values into a MultiAutocomplete;
  the placeholder vanishes on the first committed pill. All three resolve the
  input **once** and drive it with `page.keyboard`. (Directly the brief's
  warning; no failure observed because the port never did the wrong thing.)
- **`cy.type()` appends; Playwright starts at the caret** — 35043's
  `findByDisplayValue("May 22, 2027").type("{backspace}2")` needs an explicit
  `press("End")` first.
- **`keyboard.press(k,{delay})` is the key hold** — QUE-1359's
  `Cypress._.times(10, () => cy.realPress("ArrowDown"))` is ported with an
  explicit `waitForTimeout(50)` between presses.
- **Table-grid quadrant duplication is a real 1-in-4 flake** (issue 22730):
  `getByText("before-row", {exact:true})` transiently resolved to **two**
  identical `cell-data` nodes (frozen + center quadrant) → strict-mode
  violation. Green 3/4 without `.first()`, 58/58 with it. Worth knowing that
  this bites plain 2-row native-query results, not just wide virtualized tables.

## 5. Mutation testing — 7 mutants, 6 killed, 1 survived-and-explained

Inputs mutated, assertions untouched. Where each died matters, so tails were
targeted deliberately.

| # | test | mutation (input only) | result |
|---|---|---|---|
| M1 | 21979 | second exclusion click `Thursday` → `Wednesday` | **killed at the TAIL** — the intermediate `"Enormous Marble Wallet" visible` assertion still passed, so the final pill assertion is independently load-bearing |
| M2 | 32985 | typed `"foo"` → `"@"` | **survived** — see below |
| M2b | 32985 | typed `"foo"` → `"xa"` (presence probe) | **killed at the tail**; the second popover returned `alexa.leannon … xavier` |
| M3 | 45877 | select `false` → `true` | killed at the mid `filterWidget` text assertion (`"Expected Invoice: true"`) |
| M4 | 30312 | typed `"10"` → `"1"` | killed at the pill-text assertion |
| M5 | 45252 | first filter `Is empty` → `Not empty` | killed — `0 rows` vs `Showing 2 rows` (also proves the QA-DB fixture is real) |
| M6 | 45252 | last (Jsonb) filter `Not empty` → `Is empty` | **killed at the TAIL** row count (`2 rows` vs `0 rows`) — the 4-stage test is load-bearing all the way down |
| M7 | 49642 | select `Zackery Kuhn` → `Zackery Bailey` | **killed at the TAIL** `toHaveValue("Zackery Kuhn")`; the final visibility assertion would still have passed |
| M8 | 50731 | delete the `hover()` entirely | **survived** → §3, genuine upstream vacuity |

**M2 was a bad mutation, not vacuity.** The test remaps `PEOPLE.EMAIL` to a
`type/FK` pointing at `REVIEWS.REVIEWER`, so the widget searches *reviewer
usernames*, not emails — `"@"` legitimately matches nothing, exactly like
`"foo"`. Answered the "vacuous or bad mutation?" question the prescribed way,
by asserting **presence** under a mutation that *should* match (`"xa"`): the
tail died, so the assertion is sound. Recording this because the surviving
mutant read like vacuity and was not.

**Unproven, deliberately:** 9339's `expect(getByText("1,234")).toHaveCount(0)`
cannot be killed by any input mutation — it is a pure regression guard that can
only fire if the app re-introduces the bug. Not vacuous (the locator can match
in principle), just not mutation-reachable. Stated rather than glossed.

**Weak-but-faithful:** 30312's tail `"No results"` survives M4 (`Count is equal
to 1` also yields no rows). Left as upstream wrote it; the pill assertion is
what carries the test.

## 6. Not reproduced / not claimed

- No product bug is claimed anywhere in this port. Every failure encountered
  resolved to port drift or to the shared-container contamination in §2.
- **No Cypress cross-check was run** (standing rule: sibling slots are live).
  So §3's vacuity claim rests on the *mutation* result plus the fact that both
  harnesses use a byte-identical popover selector and the same first-match
  destructuring — not on a cross-harness comparison.
- Everything here is against the local jar `751c2a98` (2026-07-17). Nothing in
  this spec pins a data-derived magic number that would drift against CI's
  merge-commit jar; the closest is 18770's `4,784` cell, which is a sample-DB
  aggregate and would move only if the sample data changed.

## 7. Files

- `tests/filters-reproductions.spec.ts` (new, 29 tests)
- `support/filters-reproductions.ts` (new; `assertDescendantsNotOverflowContainer`,
  `rectOf`, `pickMiniPickerTable`). No shared support module was edited.
- `tsc --noEmit`: clean for these files (the 4 pre-existing `transforms.spec.ts`
  errors are another agent's and were present before this port).
