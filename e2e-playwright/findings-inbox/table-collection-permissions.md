# findings — table-collection-permissions (slot 4)

Source: `e2e/test/scenarios/data-studio/table-collection-permissions.cy.spec.ts` (551 lines, 23 tests)
Target: `e2e-playwright/tests/table-collection-permissions.spec.ts`
Verified against the CI uberjar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98) on slot 4104
with the `pro-self-hosted` token active — all 23 tests genuinely executed, none gate-skipped.

## Product bugs

None claimed. No `test.fixme`.

## Vacuous upstream assertions

None found. The upstream assertions are all real; the only softenings in the port are the
documented rule-3 any-of cases (`.first()` on table cells that legitimately repeat a value
across rows).

## New PORTING gotcha (worth adding to PORTING.md)

**A real mousedown that blurs a focused input can swallow the click entirely.**

`H.popover().button("Add filter").click()` in the value picker fails in Playwright while the
pills/search input still has focus. Mechanism, verified by control experiments on the jar:

- Playwright's `click()` presses the real mouse. The mousedown blurs the focused
  `PillsInput` search box; that blur handler re-renders the filter-picker form, so the
  button node the mousedown landed on is replaced before mouseup. No `click` event is ever
  delivered to the button, the form is never submitted, and **nothing errors** — the filter
  is silently not applied.
- Cypress never hit this: its `.click()` dispatches pointerdown/mousedown/pointerup/mouseup/
  click all at the resolved element, so the `click` fires regardless of the re-render.

Evidence (each run on the jar, slot 4104, same spec):

| approach | result |
|---|---|
| `btn.click()` | filter NOT applied (row count unchanged, popover still open) |
| `btn.click({ force: true })` | filter NOT applied — actionability was never the issue |
| `btn.dispatchEvent("click")` | works |
| `input.blur()` then `btn.click()` | works |
| `btn.focus()` + `press("Enter")` | works |

Fix used in the port: `blur()` the search input, then a normal `click()` — keeps real
actionability and stays closest to the upstream interaction.

Fingerprint to recognise it: a picker/form submit button that clicks cleanly (no timeout, no
error) but produces **no network request and no state change**, with the popover still open
afterwards. The failure surfaces later as an unchanged row count / unchanged result, which
reads like a backend or permissions problem rather than a lost click.

Latent, not one-off: three tests in this spec have the shape (search-picker → click option →
click "Add filter"). One failed on the first run; a second failed only under `--repeat-each=2`
(both repeats); the third has never failed but is the same construction. All three now blur
first. Any port that submits a form while a Mantine `PillsInput`/`MultiAutocomplete` holds
focus is a candidate.

## Other notes

- No new shared-helper surface was needed beyond a small spec-local module
  (`support/table-collection-permissions.ts`: `blockUserGroupPermissions`,
  `sandboxProductsOnCategory`, `popoverByIndex`, `assertQueryPermissionError`).
  Everything else — `createLibrary`/`publishTables` on `api.ts`, `sandboxTable` +
  `updatePermissionsGraph` from `dashboard-repros.ts`, `visitDataModel`/`TablePicker`
  from `data-model.ts`, `deleteToken` from `admin-extras.ts` — already existed and was
  reused read-only.
- `H.blockUserGroupPermissions` had no shared port. It is a 6-line wrapper over
  `updatePermissionsGraph` and belongs next to `sandboxTable` in a shared permissions
  module at consolidation time (it will be wanted by any sandboxing/blocking spec).

## Consolidation debt spotted

- **`blockUserGroupPermissions`** (new here) should join `updatePermissionsGraph` /
  `sandboxTable`, which currently live in `support/dashboard-repros.ts` — an odd home for
  three permission primitives that four+ specs import. The already-flagged
  `savePermissionsGraph` ≡ `saveAndConfirmPermissions` merge should take these with it into
  one `support/permissions-graph.ts`.
- `updatePermissionsGraph` is now defined **three** times (`dashboard-repros.ts`,
  `pivot-tables.ts`, `click-behavior.ts`) — same GET-merge-PUT body.
- `tableInteractive` lives in `support/models.ts`; `undoToast` in `support/metrics.ts`;
  `cartesianChartCircles` in `support/metrics.ts`. None of those are model/metric concepts —
  they are generic QB/UI locators and belong in `ui.ts` / `charts.ts`. A spec like this one
  ends up importing from five modules for what Cypress exposes as flat `H.*`.
