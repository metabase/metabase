/**
 * Helpers for the admin data-model *reproductions* spec port
 * (e2e/test/scenarios/admin/datamodel/reproductions.cy.spec.ts).
 *
 * New module per PORTING rule 9. Everything that already had a home is
 * imported read-only by the spec:
 * - `visitDataModel` / `TablePicker` / `TableSection` / `FieldSection` /
 *   `SAMPLE_DB_SCHEMA_ID` / `replaceValue` / `resetTestTableMultiSchema` from
 *   support/data-model.ts
 * - `getFilteringInput` / `getDisplayValuesInput` from
 *   support/datamodel-data-studio.ts
 * - `waitForUpdateFieldDimension` from support/admin-datamodel.ts
 * - `findByDisplayValue` / `goToMainApp` from support/filters-repros.ts
 * - `goToAdmin` / `commandPalette` / `commandPaletteButton` from
 *   support/command-palette.ts
 * - `resyncDatabase` / `WRITABLE_DB_ID` from support/schema-viewer.ts
 *
 * Only the items below have no existing home.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { FieldSection } from "./data-model";
import { expect } from "./fixtures";

/**
 * Port of DataModel.FieldSection.getNameInput()
 * (e2e-datamodel-helpers.ts:441) — `findByPlaceholderText` is a
 * testing-library EXACT string match (rule 1).
 */
export function getFieldNameInput(page: Page): Locator {
  return FieldSection.get(page).getByPlaceholder("Give this field a name", {
    exact: true,
  });
}

/**
 * Port of the spec-local `waitForFieldSyncToFinish`: poll `GET /api/field/:id`
 * until the fingerprint is non-null, up to 100 × 100ms. Upstream returns
 * silently on exhaustion ("if it doesn't [finish], we have a much bigger
 * problem than this issue") — kept, so a slow sync surfaces as a failure in
 * the test body rather than a confusing helper error.
 */
export async function waitForFieldSyncToFinish(
  api: MetabaseApi,
  fieldId: number,
) {
  for (let iteration = 0; iteration < 100; iteration++) {
    const response = await api.get(`/api/field/${fieldId}`);
    const { fingerprint } = (await response.json()) as {
      fingerprint: unknown;
    };
    if (fingerprint !== null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Port of H.isScrollableVertically (e2e-ui-elements-overflow-helpers.js),
 * evaluated in the page exactly as upstream computes it (offsetWidth -
 * clientWidth - horizontal border widths > 0).
 */
export function isScrollableVertically(element: Locator): Promise<boolean> {
  return element.evaluate((node) => {
    const el = node as HTMLElement;
    const { clientWidth, offsetWidth } = el;
    const style = window.getComputedStyle(el);
    const borderWidth =
      parseInt(style.borderLeftWidth, 10) +
      parseInt(style.borderRightWidth, 10);
    return offsetWidth - clientWidth - borderWidth > 0;
  });
}

/**
 * `closest("[data-element-id=list-section]")` for the column-picker rows.
 * XPath `ancestor-or-self::…[1]` is the nearest matching ancestor, i.e. the
 * same node jQuery's `.closest()` returns.
 */
export function closestListSection(element: Locator): Locator {
  return element.locator(
    "xpath=ancestor-or-self::*[@data-element-id='list-section'][1]",
  );
}

/**
 * Click an option inside a picker popover, scrolling the list until the row is
 * attached first.
 *
 * FINDINGS #85: the shared writable Postgres carries ~29 debris schemas, and
 * these lists are virtualized — a target that sorts after `Schema Z` is never
 * in the DOM until the list has been scrolled to it. A plain `.click()` fails
 * with "element not found" no matter how faithful the port is.
 */
export async function clickPickerOption(scope: Locator, name: string) {
  const option = scope.getByText(name, { exact: true });

  await expect(async () => {
    if ((await option.count()) > 0) {
      return;
    }
    await scope.evaluate((node) => {
      const scrollable = Array.from(
        node.querySelectorAll<HTMLElement>("*"),
      ).find((el) => el.scrollHeight > el.clientHeight + 1);
      (scrollable ?? (node as HTMLElement)).scrollTop += 400;
    });
    throw new Error(`Option "${name}" is not in the DOM yet`);
  }).toPass({ timeout: 30_000 });

  await option.first().click();
}
