/**
 * Playwright port of e2e/test/scenarios/models/models-metadata.cy.spec.js
 *
 * Porting notes:
 * - Cypress `@cardQuery` / `@dataset` / `@revert` intercepts become
 *   waitForResponse promises registered before the triggering action.
 * - `H.createQuestion` / `H.createNativeQuestion` with `visitQuestion: true`:
 *   models redirect /question/:id -> /model/:id and run /api/dataset, so those
 *   beforeEach blocks create via the API then `visitModel` (waits /api/dataset).
 * - Model metadata-editor helpers (openColumnOptions / renameColumn /
 *   setColumnType / mapColumnTo / startQuestionFromModel) live in the new
 *   support/models-metadata.ts; datasetEditBar / saveMetadataChanges /
 *   waitForLoaderToBeRemoved / openQuestionActionsItem are imported read-only
 *   from support/models-reproductions-2.ts.
 * - The question-actions menu tags "Edit metadata" with a completeness badge
 *   ("Edit metadata 89%"), so clicks use a `menuitem` regex matcher
 *   (openQuestionActionsItem / getByRole) rather than an exact getByText.
 * - `findAllByTestId("header-cell").should("contain"/"not.contain", …)` is a
 *   set-level any/none assertion → `.filter({ hasText }).first()` toBeVisible /
 *   `.filter({ hasText }).toHaveCount(0)`.
 * - `H.NativeEditor.clear()/.type()` → clearNativeEditor / typeInNativeEditor.
 * - `H.moveDnDKitElementByAlias("@dragHeader", { horizontal })` → the real-mouse
 *   moveDnDKitElement from support/dashboard-cards.ts.
 */
import {
  createDashboard,
  createNativeQuestion,
  createQuestion,
} from "../support/factories";
import { setModelMetadata } from "../support/custom-column-3";
import { addOrUpdateDashboardCard } from "../support/dashboard-management";
import { moveDnDKitElement } from "../support/dashboard-cards";
import { expect, test } from "../support/fixtures";
import {
  openQuestionActions,
  tableInteractive,
  visitModel,
} from "../support/models";
import {
  mapColumnTo,
  openColumnOptions,
  renameColumn,
  setColumnType,
  startQuestionFromModel,
} from "../support/models-metadata";
import {
  datasetEditBar,
  openQuestionActionsItem,
  saveMetadataChanges,
  waitForLoaderToBeRemoved,
} from "../support/models-reproductions-2";
import { clearNativeEditor } from "../support/native-extras";
import { typeInNativeEditor } from "../support/native-editor";
import { visualize } from "../support/notebook";
import { questionInfoButton, sidesheet } from "../support/revisions";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { modal, popover, visitDashboard } from "../support/ui";

import type { Page } from "@playwright/test";

const { PEOPLE, PRODUCTS, PRODUCTS_ID, REVIEWS, ORDERS_ID, ORDERS } =
  SAMPLE_DATABASE;

function headerCells(page: Page) {
  return page.getByTestId("header-cell");
}

/** cy.findAllByTestId("header-cell").should("contain", text) — any-of-set.
 * cy.contains is case-sensitive substring, so match with a case-sensitive
 * regex ("Tax ($)" must NOT satisfy a "TAX" check). */
async function expectHeaderContains(page: Page, text: string) {
  await expect(
    headerCells(page).filter({ hasText: caseSensitiveSubstring(text) }).first(),
  ).toBeVisible();
}

/** cy.findAllByTestId("header-cell").and("not.contain", text) — none-of-set. */
async function expectNoHeaderContains(page: Page, text: string) {
  await expect(
    headerCells(page).filter({ hasText: caseSensitiveSubstring(text) }),
  ).toHaveCount(0);
}

/** POST /api/dataset — the "@dataset" alias. */
function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** POST /api/card/:id/query — the "@cardQuery" alias. */
function waitForCardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
  );
}

test.describe("scenarios > models metadata", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("GUI model", () => {
    let modelId: number;

    test.beforeEach(async ({ mb, page }) => {
      const { id } = await createQuestion(mb.api, {
        name: "GUI Model",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
        type: "model",
      });
      modelId = id;
      await visitModel(page, modelId);
    });

    test("should edit GUI model metadata", async ({ page }) => {
      await openQuestionActions(page);

      await popover(page).getByText("89%", { exact: true }).hover();

      const tooltip = page.getByTestId("tooltip-content");
      await expect(
        tooltip.getByText(
          "Some columns are missing a column type, description, or friendly name.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        tooltip.getByText(
          "Adding metadata makes it easier for your team to explore this data.",
          { exact: true },
        ),
      ).toBeVisible();

      await popover(page)
        .getByRole("menuitem", { name: /Edit metadata/ })
        .click();
      await expect(page).toHaveURL(/\/columns/);
      await waitForLoaderToBeRemoved(page);

      await openColumnOptions(page, "Subtotal");
      await renameColumn(page, "Subtotal", "Pre-tax");
      await setColumnType(page, "No semantic type", "Currency");
      await saveMetadataChanges(page);

      // Ensure that a question created from this model inherits its metadata.
      await startQuestionFromModel(page, "GUI Model");
      await visualize(page);

      await expectHeaderContains(page, "Pre-tax ($)");
      await expectNoHeaderContains(page, "Subtotal");
    });

    test("allows for canceling changes", async ({ page }) => {
      await openQuestionActionsItem(page, /Edit metadata/);
      await waitForLoaderToBeRemoved(page);

      const RENAMED_COLUMN = "Pre-tax";

      await openColumnOptions(page, "Subtotal");
      await renameColumn(page, "Subtotal", RENAMED_COLUMN);
      await setColumnType(page, "No semantic type", "Currency");

      await datasetEditBar(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await modal(page)
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await expect(datasetEditBar(page)).toHaveCount(0);

      // Subtotal is back, with no currency formatting.
      await expect(
        headerCells(page)
          .filter({ hasText: caseSensitiveSubstring("Subtotal") })
          .filter({ hasText: caseSensitiveSubstring("$") }),
      ).toHaveCount(0);
      await expectNoHeaderContains(page, RENAMED_COLUMN);
    });

    test("clears custom metadata when a model is turned back into a question", async ({
      page,
    }) => {
      await openQuestionActions(page);
      await popover(page)
        .getByRole("menuitem", { name: /Edit metadata/ })
        .click();
      await waitForLoaderToBeRemoved(page);

      await openColumnOptions(page, "Subtotal");
      await renameColumn(page, "Subtotal", "Pre-tax");
      await setColumnType(page, "No semantic type", "Currency");
      await saveMetadataChanges(page);

      await expectHeaderContains(page, "Pre-tax ($)");
      await expectNoHeaderContains(page, "Subtotal");

      await openQuestionActions(page);
      const cardQuery = waitForCardQuery(page);
      await popover(page)
        .getByText("Turn back to saved question", { exact: true })
        .click();
      await cardQuery;

      await expectHeaderContains(page, "Subtotal");
      await expectNoHeaderContains(page, "Pre-tax ($)");
    });
  });

  test("should edit native model metadata", async ({ mb, page }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "Native Model",
      type: "model",
      native: {
        query: "SELECT * FROM ORDERS LIMIT 5",
      },
    });
    await visitModel(page, id);

    await openQuestionActions(page);

    await popover(page).getByText("37%", { exact: true }).hover();

    const tooltip = page.getByTestId("tooltip-content");
    await expect(
      tooltip.getByText(
        "Most columns are missing a column type, description, or friendly name.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      tooltip.getByText(
        "Adding metadata makes it easier for your team to explore this data.",
        { exact: true },
      ),
    ).toBeVisible();

    await popover(page)
      .getByRole("menuitem", { name: /Edit metadata/ })
      .click();
    await expect(page).toHaveURL(/\/columns/);
    await waitForLoaderToBeRemoved(page);

    await openColumnOptions(page, "SUBTOTAL");

    await mapColumnTo(page, { table: "Orders", column: "Subtotal" });
    await renameColumn(page, "Subtotal", "Pre-tax");
    await setColumnType(page, "No semantic type", "Currency");
    await saveMetadataChanges(page);

    await expectHeaderContains(page, "Pre-tax ($)");
    await expectNoHeaderContains(page, "Subtotal");

    // Ensure that a question created from this model inherits its metadata.
    await startQuestionFromModel(page, "Native Model");
    await visualize(page);

    await expectHeaderContains(page, "Pre-tax ($)");
    await expectNoHeaderContains(page, "Subtotal");
  });

  test("should keep metadata in sync with the query", async ({ mb, page }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "Native Model",
      type: "model",
      native: {
        query: "SELECT * FROM ORDERS LIMIT 5",
      },
    });
    await visitModel(page, id);

    await openQuestionActions(page);
    await popover(page)
      .getByText("Edit query definition", { exact: true })
      .click();

    await clearNativeEditor(page);
    await typeInNativeEditor(page, "SELECT TOTAL FROM ORDERS LIMIT 5");

    const dataset = waitForDataset(page);
    await page.getByTestId("editor-tabs-columns-name").click();
    await dataset;

    // Scope to the visible results table: the metadata editor also mounts a
    // hidden overscan header-cell, so a page-global getByTestId matches 2.
    const visibleHeaderCells = tableInteractive(page)
      .getByTestId("header-cell")
      .filter({ visible: true });
    await expect(visibleHeaderCells).toHaveCount(1);
    await expect(visibleHeaderCells).toHaveText("TOTAL");
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
      "TOTAL",
    );
  });

  test("should allow reverting to a specific metadata revision", async ({
    mb,
    page,
  }) => {
    const { id: nativeModelId } = await createNativeQuestion(mb.api, {
      name: "Native Model",
      type: "model",
      native: {
        query: "SELECT * FROM ORDERS LIMIT 5",
      },
    });

    const cardQuery = waitForCardQuery(page);
    await page.goto(`/model/${nativeModelId}/columns`);
    await cardQuery;

    await openColumnOptions(page, "SUBTOTAL");
    await mapColumnTo(page, { table: "Orders", column: "Subtotal" });
    await setColumnType(page, "No semantic type", "Currency");
    await saveMetadataChanges(page);

    // Revision 1
    await expect(
      tableInteractive(page).getByText("Subtotal ($)", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(page).getByText("SUBTOTAL", { exact: true }),
    ).toHaveCount(0);

    await openQuestionActions(page);
    await popover(page)
      .getByRole("menuitem", { name: /Edit metadata/ })
      .click();
    await waitForLoaderToBeRemoved(page);

    // Revision 2
    await openColumnOptions(page, "TAX");
    await mapColumnTo(page, { table: "Orders", column: "Tax" });
    await setColumnType(page, "No semantic type", "Currency");
    await saveMetadataChanges(page);

    await expectHeaderContains(page, "Subtotal ($)");
    await expectHeaderContains(page, "Tax ($)");
    await expectNoHeaderContains(page, "TAX");

    await page.reload();
    await questionInfoButton(page).click();

    await sidesheet(page).getByRole("tab", { name: "History" }).click();
    const revert = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/revision/revert",
    );
    await sidesheet(page)
      .getByTestId("question-revert-button")
      .first()
      .click();
    await revert;

    await expectHeaderContains(page, "Subtotal ($)");
    await expectNoHeaderContains(page, "Tax ($)");
    await expectHeaderContains(page, "TAX");
  });

  test("should allow reordering columns by the edge of column header (metabase#41419)", async ({
    mb,
    page,
  }) => {
    const { id } = await createQuestion(mb.api, {
      type: "model",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        fields: [["field", ORDERS.ID, null]],
        limit: 5,
      },
    });
    await visitModel(page, id);

    await openQuestionActions(page);
    await popover(page)
      .getByRole("menuitem", { name: /Edit metadata/ })
      .click();
    await expect(page).toHaveURL(/\/columns/);
    await waitForLoaderToBeRemoved(page);

    // move Product -> Price before Products -> Vendor
    const dragHeader = tableInteractive(page)
      .getByTestId("header-cell")
      .filter({ hasText: "Products → Price" })
      .first();

    await moveDnDKitElement(dragHeader, { horizontal: 600 });

    await expect(
      tableInteractive(page)
        .getByTestId("header-cell")
        .filter({ hasText: "Products → Vendor" })
        .first(),
    ).toBeVisible();
  });

  test.describe("native models metadata overwrites", () => {
    test.use({ viewport: { width: 1400, height: 800 } });

    let modelId: number;

    test.beforeEach(async ({ mb }) => {
      const { id } = await createNativeQuestion(mb.api, {
        name: "Native Model",
        type: "model",
        native: {
          query: "select * from orders limit 100",
        },
      });
      modelId = id;

      await setModelMetadata(mb.api, modelId, (field) => {
        if (field.display_name === "USER_ID") {
          return {
            ...field,
            id: ORDERS.USER_ID,
            display_name: "User ID",
            semantic_type: "type/FK",
            fk_target_field_id: PEOPLE.ID,
          };
        }
        if (field.display_name !== "QUANTITY") {
          return field;
        }
        return {
          ...field,
          display_name: "Review ID",
          semantic_type: "type/FK",
          fk_target_field_id: REVIEWS.ID,
        };
      });
    });

    // TODO (AlexP 10/09/25) -- fix and unskip this test
    test.skip("should allow drills on FK columns", async ({ page }) => {
      const dataset = waitForDataset(page);
      await page.goto(`/model/${modelId}`);
      await dataset;

      // Drill to People table
      // FK column is mapped to real DB column
      await drillFK(page, 1);
      const drill1 = waitForDataset(page);
      await drill1;
      const objectDetail1 = page.getByTestId("object-detail");
      await expect(objectDetail1.getByText("68883").first()).toBeVisible(); // zip
      await expect(
        objectDetail1.getByText("Hudson Borer").first(),
      ).toBeVisible();

      await page.goBack(); // close Object Details view

      const back = waitForDataset(page);
      await page.goBack(); // navigate away from drilled table
      await back;

      await expect(page.getByText("Native Model").first()).toBeVisible(); // back on the original model

      // Drill to Reviews table
      // FK column has a FK semantic type, no mapping to real DB columns
      await drillFK(page, 7);
      const drill2 = waitForDataset(page);
      await drill2;
      const objectDetail2 = page.getByTestId("object-detail");
      await expect(objectDetail2.getByText("7").first()).toBeVisible();
      await expect(
        objectDetail2.getByText("perry.ruecker").first(),
      ).toBeVisible();
    });

    test("should allow drills on FK columns from dashboards (metabase#42130)", async ({
      mb,
      page,
    }) => {
      const dashboard = await createDashboard(mb.api);
      const dashboardId = dashboard.id;
      await addOrUpdateDashboardCard(mb.api, {
        dashboard_id: dashboardId,
        card_id: modelId,
        card: { size_x: 24, size_y: 9 },
      });

      await visitDashboard(page, mb.api, dashboardId);

      // Drill to People table
      // FK column is mapped to real DB column
      await drillDashboardFK(page, 1);
      const dataset1 = waitForDataset(page);
      await popover(page).getByText("View details", { exact: true }).click();
      await dataset1;
      const objectDetail1 = page.getByTestId("object-detail");
      await expect(objectDetail1.getByText("1").first()).toBeVisible();
      await expect(
        objectDetail1.getByText("Hudson Borer").first(),
      ).toBeVisible();

      await page.goBack();

      // Drill to Reviews table
      // FK column has a FK semantic type, no mapping to real DB columns
      await drillDashboardFK(page, 7);
      const dataset2 = waitForDataset(page);
      await popover(page).getByText("View details", { exact: true }).click();
      await dataset2;
      const objectDetail2 = page.getByTestId("object-detail");
      await expect(objectDetail2.getByText("7").first()).toBeVisible();
      await expect(
        objectDetail2.getByText("perry.ruecker").first(),
      ).toBeVisible();
    });

    test("models metadata tab should show columns with details-only visibility (metabase#22521)", async ({
      mb,
      page,
    }) => {
      await mb.api.put(`/api/field/${PRODUCTS.VENDOR}`, {
        visibility_type: "details-only",
      });

      const { id } = await createQuestion(mb.api, {
        name: "22521",
        type: "model",
        query: {
          "source-table": PRODUCTS_ID,
          limit: 5,
        },
      });
      await visitModel(page, id);
      await expectNoHeaderContains(page, "Vendor");

      await openQuestionActionsItem(page, /Edit metadata/);
      await waitForLoaderToBeRemoved(page);

      await expect(
        tableInteractive(page)
          .getByTestId("header-cell")
          .filter({ hasText: /^Vendor$/ })
          .first(),
      ).toBeVisible();
    });
  });
});

async function drillFK(page: Page, id: number) {
  await page
    .locator(".test-Table-FK")
    .filter({ hasText: String(id) })
    .first()
    .click();
  await popover(page).getByText("View details", { exact: true }).click();
}

async function drillDashboardFK(page: Page, id: number) {
  await page
    .locator(".test-Table-FK")
    .filter({ hasText: String(id) })
    .first()
    .click();
}
