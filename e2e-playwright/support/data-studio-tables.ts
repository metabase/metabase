/**
 * Helpers for the data-studio tables spec port
 * (e2e/test/scenarios/data-studio/data-studio-tables.cy.spec.ts).
 *
 * Ports the `H.DataStudio.Tables.*` surface from
 * e2e/support/helpers/e2e-data-studio-helpers.ts that the already-ported
 * `support/data-studio-library.ts` does not already carry (it exports
 * `tableHeader` / `tableOverviewPage` — imported from there, not re-defined),
 * plus the two `H.DataModel.*` members missing from `support/data-model.ts`
 * (`FieldSection.getNameInput` / `FieldSection.getCloseButton`).
 *
 * New module per PORTING rule 9 — shared support modules are imported
 * read-only and never edited.
 */
import type { Locator, Page } from "@playwright/test";

import { tableHeader } from "./data-studio-library";
import { libraryPage } from "./data-studio-library";
import { icon } from "./ui";

// === Tables: pages ==================================================

/** Port of H.DataStudio.Tables.fieldsPage(). */
export function tableFieldsPage(page: Page): Locator {
  return page.getByTestId("table-fields-page");
}

/** Port of H.DataStudio.Tables.visitOverviewPage(tableId). */
export async function visitTableOverviewPage(page: Page, tableId: number) {
  await page.goto(`/data-studio/library/tables/${tableId}`);
}

/** Port of H.DataStudio.Tables.visitFieldsPage(tableId). */
export async function visitTableFieldsPage(page: Page, tableId: number) {
  await page.goto(`/data-studio/library/tables/${tableId}/fields`);
}

// === Tables: header =================================================

/** Port of H.DataStudio.Tables.nameInput(): cy.findByTestId("table-name-input").
 * The testid sits on the EditableText's `<textarea>` (PaneHeaderInput →
 * EditableText), so `toHaveValue` is the right assertion. */
export function tableNameInput(page: Page): Locator {
  return page.getByTestId("table-name-input");
}

/** Port of H.DataStudio.Tables.moreMenu(): header().icon("ellipsis").
 * `.first()` mirrors Cypress's first-match `.click()` semantics. */
export function tableMoreMenu(page: Page): Locator {
  return icon(tableHeader(page), "ellipsis").first();
}

/** Port of H.DataStudio.Tables.overviewTab(): header().findByText("Overview"). */
export function tableOverviewTab(page: Page): Locator {
  return tableHeader(page).getByText("Overview", { exact: true });
}

/** Port of H.DataStudio.Tables.fieldsTab(). */
export function tableFieldsTab(page: Page): Locator {
  return tableHeader(page).getByText("Fields", { exact: true });
}

/** Port of H.DataStudio.Tables.dependenciesTab(). */
export function tableDependenciesTab(page: Page): Locator {
  return tableHeader(page).getByText("Dependencies", { exact: true });
}

/**
 * Port of H.DataStudio.Tables.moreMenuViewTable(): the popover's
 * `menuitem` matching /View/, with its `target` attribute stripped so the
 * table opens in the same tab, then clicked.
 */
export async function clickMoreMenuViewTable(page: Page, scope: Locator) {
  const item = scope.getByRole("menuitem", { name: /View/ }).first();
  await item.evaluate((element) => element.removeAttribute("target"));
  await item.click();
}

// === Tables: overview ===============================================

/** Port of H.DataStudio.Tables.Overview.descriptionSidebar(). */
export function tableDescriptionSidebar(page: Page): Locator {
  return page.getByTestId("table-description-sidebar");
}

/** Port of H.DataStudio.Tables.Overview.descriptionText(). */
export function tableDescriptionText(page: Page): Locator {
  return page.getByTestId("table-description-section").getByTestId(
    "editable-text",
  );
}

/** Port of H.DataStudio.Tables.Overview.descriptionInput(). */
export function tableDescriptionInput(page: Page): Locator {
  return page
    .getByTestId("table-description-section")
    .getByPlaceholder("No description", { exact: true });
}

// === Library page ===================================================

/** Port of H.DataStudio.Library.allTableItems(). */
export function allTableItems(page: Page): Locator {
  return libraryPage(page).getByTestId("table-name");
}

// === DataModel members missing from support/data-model.ts ===========

/** Port of H.DataModel.FieldSection.getNameInput(). */
export function fieldSectionNameInput(page: Page): Locator {
  return page
    .getByTestId("field-section")
    .getByPlaceholder("Give this field a name", { exact: true });
}

/** Port of H.DataModel.FieldSection.getCloseButton():
 * fieldSectionHeader().findByRole("link", { name: /close/ }). */
export function fieldSectionCloseButton(page: Page): Locator {
  return page
    .getByTestId("field-section-header")
    .getByRole("link", { name: /close/i });
}

// === Shared editing primitives ======================================

/**
 * `.clear().type(text).blur()` on an EditableText textarea.
 *
 * `fill()` does not mark these dirty (PORTING wave-5 gotcha), and the blur
 * must go through `blur()` on the focused textarea — `keyboard.press("Tab")`
 * bounces off EditableText's root `onKeyDown`, which re-focuses on every
 * non-Enter key.
 */
export async function replaceEditableText(input: Locator, text: string) {
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.press("Backspace");
  await input.pressSequentially(text);
  await input.blur();
}
