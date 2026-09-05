/**
 * Playwright port of e2e/test/scenarios/models/models-list-view.cy.spec.js
 *
 * Porting notes:
 * - `H.createNativeQuestion({ type: "model" }, { visitQuestion: true })`: models
 *   redirect /question/:id -> /model/:id and run /api/dataset, so the beforeEach
 *   creates via the API then `visitModel` (waits /api/dataset), mirroring
 *   models-metadata.spec.ts.
 * - The question-actions "Edit metadata" item carries a completeness badge
 *   ("Edit metadata 45%"), so it's clicked via openQuestionActionsItem's
 *   `menuitem` regex matcher, never an exact getByText (per the brief).
 * - `cy.findAllByRole("img").should("have.attr", ...)` / `.eq(2)` etc. read the
 *   FIRST (or n-th) element's attribute — chai-jquery `have.attr` is first-match,
 *   not any/all — ported as `.first()` / `.nth()` (expectFirstImgAriaLabel).
 * - `Color(colors["accent1"]).rgb().toString()` -> inlined ACCENT1_RGB (no path
 *   alias into frontend/src from this package).
 * - MultiSelect column search boxes get real keystrokes (pressSequentially) so
 *   the debounced option dropdown filters.
 * - Save-changes awaits only /api/dataset (the "@dataset" alias), like upstream.
 */
import { createNativeQuestion } from "../support/factories";
import { setModelMetadata } from "../support/custom-column-3";
import { expect, test } from "../support/fixtures";
import { visitModel } from "../support/models";
import {
  datasetEditBar,
  openQuestionActionsItem,
} from "../support/models-reproductions-2";
import {
  ACCENT1_RGB,
  dragColumnOnto,
  expectFirstImgAriaLabel,
  saveChangesAndWaitForDataset,
  tableHeaderClick,
} from "../support/models-list-view";
import { undoToast } from "../support/metrics";
import { modal, popover } from "../support/ui";

import type { MetabaseApi } from "../support/api";
import type { Page } from "@playwright/test";

const NATIVE_MODEL = {
  name: "Native Model",
  type: "model" as const,
  native: { query: "SELECT * FROM ORDERS LIMIT 5" },
};

async function createAndVisitNativeModel(page: Page, api: MetabaseApi) {
  const { id } = await createNativeQuestion(api, NATIVE_MODEL);
  await visitModel(page, id);
  return id;
}

/** Open Edit metadata -> Settings tab -> pick the "List" display. */
async function openListSettings(page: Page) {
  await openQuestionActionsItem(page, /Edit metadata/);

  await datasetEditBar(page).getByText("Settings", { exact: true }).click();

  const sidebarRight = page.getByTestId("sidebar-right");
  await expect(sidebarRight.getByText("Model Settings")).toBeVisible();
  await sidebarRight.getByText("List", { exact: true }).click();
}

test.describe("scenarios > models list view", () => {
  test.describe("basic scenarios", () => {
    test.beforeEach(async ({ mb, page }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await createAndVisitNativeModel(page, mb.api);
    });

    test("should allow to change default view", async ({ page }) => {
      await openQuestionActionsItem(page, /Edit metadata/);

      await datasetEditBar(page).getByText("Settings", { exact: true }).click();

      const sidebarRight = page.getByTestId("sidebar-right");
      await expect(sidebarRight.getByText("Model Settings")).toBeVisible();
      await sidebarRight.getByText("List", { exact: true }).click();

      // Ensure List view is enabled
      await expect(page.getByTestId("list-view")).toBeVisible();

      // Ensure the List View setting stays applied after switching tabs
      await datasetEditBar(page).getByText("Columns", { exact: true }).click();
      await datasetEditBar(page).getByText("Settings", { exact: true }).click();
      await expect(page.getByTestId("list-view")).toBeVisible();
      await expect(sidebarRight.getByLabel("List")).toBeChecked();

      await saveChangesAndWaitForDataset(page);

      // Display data as list after saving
      await expect(page.getByTestId("list-view")).toBeVisible();
    });

    test("should allow to customize list view", async ({ page }) => {
      await openListSettings(page);

      // List can be customized
      await page
        .getByRole("button", { name: "Customize the List layout", exact: true })
        .click();

      const leftColumns = page.getByTestId("list-view-left-columns");
      const rightColumns = page.getByTestId("list-view-right-columns");
      const listPreview = page.getByTestId("list-view-preview");

      // Default columns selected
      await expect(leftColumns).toBeVisible();
      await expect(leftColumns.getByText("ID", { exact: true })).toBeVisible();

      await expect(
        rightColumns.getByText("USER_ID", { exact: true }),
      ).toBeVisible();
      await expect(
        rightColumns.getByText("PRODUCT_ID", { exact: true }),
      ).toBeVisible();
      await expect(
        rightColumns.getByText("SUBTOTAL", { exact: true }),
      ).toBeVisible();
      await expect(rightColumns.getByText("TAX", { exact: true })).toBeVisible();

      // Preview shows sample data values
      await expect(listPreview).toBeVisible();
      await expectFirstImgAriaLabel(listPreview, "document icon");
      await expect(listPreview.getByText("1", { exact: true })).toHaveCount(2);
      await expect(listPreview.getByText("14", { exact: true })).toBeVisible();
      await expect(
        listPreview.getByText("37.65", { exact: true }),
      ).toBeVisible();
      await expect(listPreview.getByText("2.07", { exact: true })).toBeVisible();

      // Add CREATED_AT column to right columns
      await rightColumns.locator("input").pressSequentially("CR");

      // Dropdown shows only the CREATED_AT option
      await expect(popover(page).getByText("CREATED_AT")).toBeVisible();
      await expect(popover(page).locator("[role='option']")).toHaveCount(1);
      await popover(page).getByText("CREATED_AT").click();

      // Preview updates with CREATED_AT value
      await expect(
        listPreview.getByText("February 11, 2028, 9:40 PM"),
      ).toBeVisible();

      // Remove TAX column
      await rightColumns
        .getByText("TAX", { exact: true })
        .locator("..")
        .locator("button")
        .click();

      // Preview updates (TAX value gone)
      await expect(
        listPreview.getByText("2.07", { exact: true }),
      ).toHaveCount(0);

      // Empty column preview displays placeholder value
      await rightColumns.locator("input").pressSequentially("DISC");
      await popover(page).getByText("DISCOUNT").click();
      // DISCOUNT is currency-formatted ("$123.46"), so the "$" shares the node
      // — substring regex, not exact (the mixed-content-text-node rule).
      await expect(listPreview.getByText(/123\.46/)).toBeVisible();

      // List item icon starts as the document icon
      await expectFirstImgAriaLabel(listPreview, "document icon");

      // Update list item icon
      await page.getByTestId("list-view-icon").click();
      const iconPopover = popover(page);
      await expect(
        iconPopover.getByRole("img", { name: "factory icon", exact: true }),
      ).toHaveAttribute("aria-label", "factory icon");
      await iconPopover
        .getByRole("img", { name: "factory icon", exact: true })
        .click();

      const accentButton = iconPopover
        .getByTestId("list-view-icon-colors")
        .getByRole("button")
        .nth(2);
      await expect(accentButton).toHaveCSS("background-color", ACCENT1_RGB);
      await accentButton.click();

      const previewIcon = listPreview.getByRole("img").first();
      await expect(previewIcon).toHaveAttribute("aria-label", "factory icon");
      await expect(previewIcon).toHaveCSS("color", ACCENT1_RGB);

      await saveChangesAndWaitForDataset(page);

      // Custom column set is correct
      const viz = page.getByTestId("visualization-root");
      await expect(viz.getByText("ID", { exact: true })).toBeVisible();
      await expect(viz.getByText("USER_ID", { exact: true })).toBeVisible();
      await expect(viz.getByText("PRODUCT_ID", { exact: true })).toBeVisible();
      await expect(viz.getByText("SUBTOTAL", { exact: true })).toBeVisible();
      await expect(viz.getByText("TAX", { exact: true })).toHaveCount(0);

      await expectFirstImgAriaLabel(viz, "factory icon");
      await expect(viz.getByText("February 11, 2028, 9:40 PM")).toBeVisible();
      await expect(viz.getByText("14", { exact: true })).toBeVisible();
      await expect(viz.getByText("37.65", { exact: true })).toBeVisible();
      await expect(viz.getByText("2.07", { exact: true })).toHaveCount(0);
    });

    test("should allow to filter and drag-n-drop columns", async ({ page }) => {
      await openListSettings(page);

      await page
        .getByRole("button", { name: "Customize the List layout", exact: true })
        .click();

      const rightColumns = page.getByTestId("list-view-right-columns");
      const listPreview = page.getByTestId("list-view-preview");
      const sidebarRight = page.getByTestId("sidebar-right");

      // Used column is not present in the unused-columns list
      await expect(
        sidebarRight.getByText("PRODUCT_ID", { exact: true }),
      ).toHaveCount(0);

      await rightColumns.locator("input").click();
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");

      // A draggable "SUBTOTAL" is now available in the sidebar
      await expect(
        sidebarRight.getByText("SUBTOTAL", { exact: true }),
      ).toBeVisible();
      await expect(
        listPreview.getByText("37.65", { exact: true }),
      ).toHaveCount(0);

      await sidebarRight.locator("input").pressSequentially("SUB");

      await dragColumnOnto(
        sidebarRight.getByText("SUBTOTAL", { exact: true }),
        rightColumns.locator("input"),
      );

      // Drag was handled correctly
      await expect(
        rightColumns.getByText("SUBTOTAL", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebarRight.getByText("SUBTOTAL", { exact: true }),
      ).toHaveCount(0);
      await expect(sidebarRight.getByText("No available columns")).toBeVisible();
      await expect(
        listPreview.getByText("37.65", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("advanced scenarios", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
    });

    test("should preserve list view after model duplication", async ({
      mb,
      page,
    }) => {
      await createAndVisitNativeModel(page, mb.api);

      // Going through the full flow, because `display: list` is not preserved on BE.
      await openListSettings(page);
      await saveChangesAndWaitForDataset(page);
      await expect(page.getByTestId("list-view")).toBeVisible();

      await openQuestionActionsItem(page, "Duplicate");

      const dataset = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await modal(page)
        .getByRole("button", { name: "Duplicate", exact: true })
        .click();
      await dataset;

      // Display data as list after duplication
      await expect(
        page.getByTestId("qb-header").getByText("Native Model - Duplicate"),
      ).toBeVisible();
      await expect(page.getByTestId("list-view")).toBeVisible();
    });

    test("should change list view to table when saved as question", async ({
      mb,
      page,
    }) => {
      await createAndVisitNativeModel(page, mb.api);

      await openListSettings(page);
      await saveChangesAndWaitForDataset(page);
      await expect(page.getByTestId("list-view")).toBeVisible();

      // Upstream `cy.wait("@dataset")` here is satisfied retroactively by the
      // save step's /api/dataset (cy.wait consumes past responses); turning
      // back to a saved question re-runs via /api/card/:id/query, not
      // /api/dataset, so a fresh waitForResponse would hang. Drop it and lean
      // on the auto-retrying assertions below.
      await openQuestionActionsItem(page, "Turn back to saved question");

      await expect(undoToast(page)).toContainText("This is a question now");
      await expect(page.getByTestId("list-view")).toHaveCount(0);
    });

    test("should consider mini bar chart setting for quantity/score columns", async ({
      mb,
      page,
    }) => {
      const { id: nativeModelId } = await createNativeQuestion(
        mb.api,
        NATIVE_MODEL,
      );
      await mb.api.put(`/api/card/${nativeModelId}`, { display: "list" });
      await setModelMetadata(mb.api, nativeModelId, (field) => {
        if (field.display_name === "SUBTOTAL") {
          return {
            ...field,
            semantic_type: "type/Quantity",
            settings: { show_mini_bar: true },
          };
        }
        return field;
      });
      await visitModel(page, nativeModelId);

      await expect(
        page
          .getByTestId("list-view")
          .getByTestId("mini-bar-container")
          .first(),
      ).toBeVisible();

      await openQuestionActionsItem(page, /Edit metadata/);

      await datasetEditBar(page).getByText("Columns", { exact: true }).click();

      await tableHeaderClick(page, /Subtotal/i);

      const sidebar = page.locator("main aside");
      await sidebar.getByRole("tab", { name: "Formatting" }).click();
      await sidebar
        .getByLabel("Show a mini bar chart")
        .click({ force: true });

      await saveChangesAndWaitForDataset(page);

      await expect(page.getByTestId("mini-bar-container")).toHaveCount(0);
    });
  });
});
