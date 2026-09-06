/**
 * New helpers for the models-list-view spec port
 * (e2e/test/scenarios/models/models-list-view.cy.spec.js).
 *
 * Everything else this spec needs is imported read-only from the shared
 * modules (factories, custom-column-3, models, models-reproductions-2, ui,
 * metrics). Only genuinely-new surface lives here.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

/**
 * The Cypress spec asserts `Color(colors["accent1"]).rgb().toString()`.
 * `colors["accent1"]` resolves to the light-theme accent1 (#88BF4D — see
 * frontend/src/metabase/ui/colors/constants/accent-colors.ts); this package
 * has no path alias into frontend/src, so the computed rgb() is inlined
 * (mirrors BORDER_STRONG / TREND_LINE_DASH in the other viz ports).
 */
export const ACCENT1_RGB = "rgb(136, 191, 77)";

/**
 * Port of H.tableHeaderClick(/Subtotal/i): the notebook.ts tableHeaderClick
 * takes an exact string, but the model-metadata Columns editor spec clicks by
 * a case-insensitive regex. Header cells live under the `table-header` testid
 * (H.tableInteractiveHeader). */
export async function tableHeaderClick(page: Page, name: RegExp) {
  await page.getByTestId("table-header").getByText(name).first().click();
}

/**
 * Port of the spec's Save-changes flow in the model-metadata editor:
 * `cy.findByTestId("dataset-edit-bar").button("Save changes").click();
 *  cy.wait("@dataset")`. Faithful to the original, which awaits only the
 * /api/dataset re-run (NOT the PUT /api/card), so this doesn't strengthen the
 * assertion by also gating on the metadata PUT.
 */
export async function saveChangesAndWaitForDataset(page: Page) {
  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await page
    .getByTestId("dataset-edit-bar")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await dataset;
}

/**
 * Port of H.dragAndDropByElement(subject, target, { dragend: false }) — the
 * list-view column config uses native HTML5 draggables (the Cypress helper
 * fires dragstart/drop/dragend directly). Playwright's real dragTo drives the
 * full HTML5 dnd sequence via CDP interception (see collections.ts dragAndDrop);
 * the app applies the change on `drop`, so the extra dragend is harmless.
 */
export async function dragColumnOnto(subject: Locator, target: Locator) {
  await subject.dragTo(target);
}

/**
 * Port of the repeated `cy.findAllByRole("img").first().should("have.attr",
 * "aria-label", value)` — chai-jquery's `have.attr` reads the FIRST element's
 * attribute, so this is a first-match assertion, not any/all.
 */
export async function expectFirstImgAriaLabel(scope: Locator, label: string) {
  await expect(scope.getByRole("img").first()).toHaveAttribute(
    "aria-label",
    label,
  );
}
