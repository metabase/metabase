# table-editing

Port of `e2e/test/scenarios/table-editing/table-editing.cy.spec.ts` →
`tests/table-editing.spec.ts` (21 Playwright tests — the 3-case inline-editing
`forEach` expands to 3). New spec-local helpers in `support/table-editing.ts`.

## Verification

- **Jar, slot 4, gate off: 21/21 skipped cleanly.** This is the expected and
  only outcome on the jar. tsc clean.
- **All-skip / runtime-unverified** — same class as `actions-on-dashboards`
  (wave-11 gotcha). The whole spec drives the writable QA postgres DB: the
  top-level `beforeEach` restores the `postgres-writable` snapshot and resets a
  writable table, which the jar's snapshots don't contain and the default setup
  can't produce. Gated on `PW_QA_DB_ENABLED` (rule 6). Even the "table editing
  bugs" describe, which pokes the Sample DB (WRK-907), inherits that parent
  `beforeEach`, so there is no jar-runnable subset. Faithful by construction;
  runs when the writable container + snapshot are enabled.
- No `test.fixme` / product-bug claims, so no Cypress cross-check was needed
  (nothing could execute to disagree with).

## Fixes / decisions (all "known gotcha, avoided")

- **Reuse, no shared-file edits.** `resetTestTable` / `queryWritableDB` from
  `actions-on-dashboards.ts`; `getTableId` / `resyncDatabase` / `WRITABLE_DB_ID`
  / `menu` from `schema-viewer.ts`; `updatePermissionsGraph` from
  `dashboard-repros.ts`; `tableInteractiveBody` from `table-column-settings.ts`;
  `undoToast` from `metrics.ts`; `icon`/`modal`/`popover` from `ui.ts`. Only new
  code lives in `support/table-editing.ts`.
- **Transient undo toasts → `.first()`** on every "Successfully updated" /
  "Record successfully created" / "Successfully deleted" /
  "Couldn't save table changes" assertion (wave-13 CI-parallelism strict-mode
  guard).
- **`openEditRowModal` quadrant duplication.** The edit-table grid renders each
  data row once per horizontal quadrant, so `data-dataset-index` matches two
  `role="row"` sections — the frozen section (nth 0) carries the hover-revealed
  `row-edit-icon`, the center section (nth 1) carries the `cell-data`. Ported
  faithfully; returns the ID cell text (the Cypress `@rowId` alias).
- **`getTableEditIcon`**: Cypress does
  `findByTestId("browse-schemas").contains(regex).realHover().findByTestId("edit-table-icon")`.
  Ported as: match the label by regex, resolve the nearest ancestor that
  actually contains an `edit-table-icon`, hover it (rule 4), return the icon.
- **`cy.realType` on FK-search fields (WRK-907)** → `keyboard.type` after a
  click that focuses the combobox (typeahead — real keystrokes, rule 5).
- **`{selectAll}{backspace}<v>` → `fill()`** for the modal / inline cell inputs
  (plain inputs, no debounce dependency); combobox typeaheads (Team Name)
  use `pressSequentially`.
- **`have.text` / exact `findByText` → `toHaveText` / `getByText({exact:true})`**
  (rule 1). `should("not.exist")` → `toHaveCount(0)`; `should("exist")` on the
  hover-gated `row-edit-icon` → `toBeAttached()` (present, not necessarily
  visible).
- **Snowplow → no-op stubs** (rule 6). The events the stubs stand in for:
  `edit_data_button_clicked`, `edit_data_record_modified` (update/create).

## Dividends

None runtime-observed (nothing executes without the writable DB). No new
gotchas beyond the established all-skip caveat.
