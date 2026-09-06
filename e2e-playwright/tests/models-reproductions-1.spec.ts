/**
 * Playwright port of e2e/test/scenarios/models/reproductions-1.cy.spec.ts
 *
 * A grab-bag of model bug reproductions; every issue number is preserved.
 *
 * Porting notes:
 * - Cypress `@dataset` / `@updateModel` / `@updateCard` / `@createModel`
 *   intercepts become waitForResponse promises registered before the
 *   triggering action (waitForDataset / waitForCardUpdate / an inline
 *   POST /api/card wait). The never-awaited `@fetchDatabase`, `@card`,
 *   `@metadata`, `@fks`, `@rootCollection` intercepts are dropped (rule 2).
 * - "Edit metadata" in the question-actions menu carries a completeness badge
 *   ("Edit metadata 33%"), so it's clicked via openQuestionActionsItem's
 *   role+regex matcher, never an exact getByText.
 * - The column-metadata "Display name"/"Description" fields are Formik text
 *   inputs/textareas, so `should("have.text", …)` / `should("have.value", …)`
 *   port to toHaveValue; `.type()` ports to fill (+ blur) for these Formik
 *   fields. The QUESTION description in the sidesheet (issue 34574) is the
 *   markdown EditableText — real keystrokes + Tab-to-blur, asserted as
 *   rendered markdown.
 * - `H.moveDnDKitElementByAlias(alias, { horizontal })` → moveDnDKitElement
 *   (real-mouse) from support/dashboard-cards.ts.
 * - `.should("be.visible")` on a multi-match header-cell set is an ANY-of
 *   assertion → `.filter({ visible: true }).first()` (rule 3).
 * - Spec-shared helpers (getHeaderCell, assertColumnSelected,
 *   countDatasetRequests, expectNoDisplayValue) live in
 *   support/models-reproductions-1.ts.
 * - issue 43088 needs an EE token (instance-analytics models) → describe-level
 *   test.skip gate + activateToken in beforeEach.
 */
import { test, expect } from "../support/fixtures";
import type { Locator, Page } from "@playwright/test";

import { getPinnedSection } from "../support/collections";
import { moveDnDKitElement } from "../support/dashboard-cards";
import { hovercard } from "../support/data-model";
import {
  editDashboard,
  pickEntity,
  selectDropdown,
  setFilter,
  sidebar,
} from "../support/dashboard";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { openVizSettingsSidebar } from "../support/charts";
import { findByDisplayValue } from "../support/filters-repros";
import { join } from "../support/joins";
import { undoToast } from "../support/metrics";
import {
  openQuestionActions,
  summarize,
  tableInteractive,
  visitModel,
  waitForDataset,
} from "../support/models";
import {
  assertColumnSelected,
  countDatasetRequests,
  expectNoDisplayValue,
  getHeaderCell,
} from "../support/models-reproductions-1";
import {
  datasetEditBar,
  openQuestionActionsItem,
  startNewModel,
  waitForLoaderToBeRemoved,
} from "../support/models-reproductions-2";
import { waitForCardUpdate } from "../support/models-core";
import {
  assertQueryBuilderRowCount,
  entityPickerModal,
  getNotebookStep,
  miniPicker,
  openNotebook,
  startNewQuestion,
  tableHeaderClick,
  tableHeaderColumn,
  visualize,
} from "../support/notebook";
import { resolveToken } from "../support/api";
import { rightSidebar } from "../support/question-saved";
import { questionInfoButton, sidesheet } from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { setDropdownFilterType } from "../support/sql-filters-source";
import {
  icon,
  main,
  modal,
  navigationSidebar,
  popover,
  visitDashboard,
} from "../support/ui";
import { openObjectDetail } from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

function headerCell(page: Page, index: number): Locator {
  return page.getByTestId("header-cell").nth(index);
}

function saveChangesButton(scope: Page | Locator): Locator {
  return scope.getByRole("button", { name: "Save changes", exact: true });
}

test.describe("issue 29943", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("selects the right column when clicking a column header (metabase#29943)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      type: "model",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          Custom: ["+", 1, 1],
        },
        fields: [
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
          ["expression", "Custom", { "base-type": "type/Integer" }],
        ],
        limit: 5,
      },
    });
    await visitModel(page, id);

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    // reorderTotalAndCustomColumns
    await getHeaderCell(page, 1, "Total");
    await getHeaderCell(page, 2, "Custom");
    await moveDnDKitElement(tableHeaderColumn(page, "Custom"), {
      horizontal: -100,
    });
    await getHeaderCell(page, 1, "Custom");
    await getHeaderCell(page, 2, "Total");

    const dataset = waitForDataset(page);
    await saveChangesButton(page).click();
    await dataset;

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    await assertColumnSelected(page, 0, "ID");

    await getHeaderCell(page, 1, "Custom");
    await tableHeaderClick(page, "Custom");
    await assertColumnSelected(page, 1, "Custom");

    await getHeaderCell(page, 2, "Total");
    await tableHeaderClick(page, "Total");
    await assertColumnSelected(page, 2, "Total");

    await getHeaderCell(page, 0, "ID");
    await tableHeaderClick(page, "ID");
    await assertColumnSelected(page, 0, "ID");
  });
});

test.describe("issues with metadata editing on models with custom expressions", () => {
  const DISCOUNT_FIELD_REF = [
    "field",
    ORDERS.DISCOUNT,
    { "base-type": "type/Float" },
  ];

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  async function assertNoError(page: Page) {
    await expect(
      page.getByRole("button", { name: "Get Answer" }),
    ).toHaveCount(0);
    await expect(
      main(page).getByText("There was a problem with your question", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();
  }

  test("can edit metadata of a model with a custom column (metabase#35711, metabase#39993)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      type: "model",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          "Custom column": ["-", DISCOUNT_FIELD_REF, 1],
        },
        limit: 5,
      },
    });
    await visitModel(page, id);

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    // reorderTaxAndTotalColumns
    await expect(headerCell(page, 4)).toHaveText("Tax");
    await expect(headerCell(page, 5)).toHaveText("Total");
    await moveDnDKitElement(tableHeaderColumn(page, "Total"), {
      horizontal: -80,
    });
    await expect(headerCell(page, 4)).toHaveText("Total");
    await expect(headerCell(page, 5)).toHaveText("Tax");

    await assertNoError(page);

    await page.getByTestId("editor-tabs-query-name").click();
    await assertNoError(page);
  });
});

test.describe("issues 25884 and 34349", () => {
  const ID_DESCRIPTION =
    "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens.";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show empty description input for columns without description in metadata (metabase#25884, metabase#34349)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      type: "model",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          Country: ["substring", "United States", 1, 20],
        },
        fields: [
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          ["expression", "Country", { "base-type": "type/Text" }],
        ],
        limit: 5,
      },
    });
    await visitModel(page, id);

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    await expect(page.getByLabel("Description")).toHaveValue(ID_DESCRIPTION);

    await tableHeaderClick(page, "Country");
    await expect(page.getByLabel("Description")).toHaveValue("");

    await tableHeaderClick(page, "ID");
    await expect(page.getByLabel("Description")).toHaveValue(ID_DESCRIPTION);
  });
});

test.describe("issue 23103", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shows correct number of distinct values (metabase#23103)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      type: "model",
      native: { query: "select * from products limit 5" },
    });
    await visitModel(page, id);

    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);

    await page
      .getByTestId("header-cell")
      .filter({ hasText: "CATEGORY" })
      .first()
      .click();
    await page
      .getByTestId("select-button")
      .filter({ hasText: "None" })
      .first()
      .click();
    await popover(page).getByText("Products", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();

    const updateModel = waitForCardUpdate(page);
    await saveChangesButton(page).click();
    await updateModel;
    await expect(
      page.getByRole("button", { name: "Saving…" }),
    ).toHaveCount(0);

    await page
      .getByTestId("header-cell")
      .filter({ hasText: "Category" })
      .first()
      .hover();

    await expect(
      hovercard(page).getByText("4 distinct values", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 41785, issue 46756", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("does not break the question when removing column with the same mapping as another column (metabase#41785) (metabase#46756)", async ({
    page,
  }) => {
    // it's important to create the model through UI to reproduce this issue
    await startNewModel(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Products", { exact: true }).click();
    await join(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Products", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    const dataset = waitForDataset(page);
    await page.getByTestId("run-button").click();
    await dataset;

    await page.getByRole("button", { name: "Save", exact: true }).click();
    const cardGet = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
    );
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();

    // verify that we redirected after saving the model and all card data is loaded
    await expect(page).toHaveURL(/products-products/);
    await cardGet;
    await expect(page.getByTestId("visualization-root")).toContainText(
      "Rustic Paper Wallet",
    );

    await openVizSettingsSidebar(page);
    const chartSidebar = page.getByTestId("chartsettings-sidebar");
    await expect(chartSidebar.getByText("Ean", { exact: true })).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products_2 → Ean", { exact: true }),
    ).toHaveCount(1);

    await chartSidebar
      .getByRole("button", { name: "Add or remove columns" })
      .click();
    await expect(chartSidebar.getByText("Ean", { exact: true })).toHaveCount(1);
    await expect(chartSidebar.getByLabel("Ean", { exact: true })).toBeChecked();

    await expect(
      chartSidebar.getByLabel("Products_2 → Ean", { exact: true }),
    ).toBeChecked();
    await expect(
      chartSidebar.getByText("Products_2 → Ean", { exact: true }),
    ).toHaveCount(1);
    const removeColumn = waitForDataset(page);
    await chartSidebar.getByText("Products_2 → Ean", { exact: true }).click();
    await removeColumn;

    // Only the clicked column should be removed (metabase#46756)
    await expect(
      chartSidebar.getByLabel("Products_2 → Ean", { exact: true }),
    ).not.toBeChecked();
    await expect(chartSidebar.getByLabel("Ean", { exact: true })).toBeChecked();

    // There should be no error in the table visualization (metabase#41785)
    await expect(
      page
        .getByTestId("header-cell")
        .filter({ hasText: "Ean" })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await expect(tableInteractive(page)).toContainText("Small Marble Shoes");
  });
});

test.describe("issue 40635", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  async function assertTableHeader(page: Page, index: number, name: string) {
    await expect(headerCell(page, index)).toHaveText(name);
  }

  async function assertVisualizationColumns(page: Page) {
    await assertTableHeader(page, 0, "ID");
    await assertTableHeader(page, 1, "Products → ID");
    await assertTableHeader(page, 2, "Products - User → ID");
  }

  async function assertSettingsSidebar(page: Page) {
    await openVizSettingsSidebar(page);

    const chartSidebar = page.getByTestId("chartsettings-sidebar");
    await expect(chartSidebar.getByText("ID", { exact: true })).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products → ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products - User → ID", { exact: true }),
    ).toHaveCount(1);

    await chartSidebar
      .getByRole("button", { name: "Add or remove columns" })
      .click();
    await expect(chartSidebar.getByText("ID", { exact: true })).toHaveCount(4);
    await expect(
      chartSidebar.getByText("Products", { exact: true }),
    ).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products - User", { exact: true }),
    ).toHaveCount(1);

    await page.getByRole("button", { name: "Done", exact: true }).click();
  }

  async function assertSettingsSidebarNestedQuery(page: Page) {
    await openVizSettingsSidebar(page);

    const chartSidebar = page.getByTestId("chartsettings-sidebar");
    await expect(chartSidebar.getByText("ID", { exact: true })).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products → ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products - User → ID", { exact: true }),
    ).toHaveCount(1);

    await chartSidebar
      .getByRole("button", { name: "Add or remove columns" })
      .click();
    await expect(chartSidebar.getByText("ID", { exact: true })).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products → ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      chartSidebar.getByText("Products - User → ID", { exact: true }),
    ).toHaveCount(1);

    await page.getByRole("button", { name: "Done", exact: true }).click();
  }

  test("correctly displays question's and nested model's column names (metabase#40635)", async ({
    page,
  }) => {
    await startNewQuestion(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns" })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();

    await join(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Products", { exact: true }).click();

    await getNotebookStep(page, "join", { stage: 0, index: 0 })
      .getByRole("button", { name: "Pick columns" })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await join(page);
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Products", { exact: true }).click();

    await getNotebookStep(page, "join", { stage: 0, index: 1 })
      .getByRole("button", { name: "Pick columns" })
      .click();
    await popover(page).getByText("Select all", { exact: true }).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await getNotebookStep(page, "join", { stage: 0, index: 1 })
      .getByText("Product ID", { exact: true })
      .click();
    await popover(page).getByText("User ID", { exact: true }).click();

    await visualize(page);
    await assertSettingsSidebar(page);
    await assertVisualizationColumns(page);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();

    await expect(undoToast(page)).toContainText("Add this to a dashboard");
    await icon(undoToast(page), "close").click();

    await assertSettingsSidebar(page);
    await assertVisualizationColumns(page);

    await openQuestionActions(page);
    await popover(page).getByText("Turn into a model", { exact: true }).click();
    await modal(page)
      .getByRole("button", { name: "Turn this into a model", exact: true })
      .click();
    await expect(undoToast(page)).toContainText("This is a model now");
    await icon(undoToast(page), "close").click();

    await assertSettingsSidebarNestedQuery(page);
    await assertVisualizationColumns(page);

    await openNotebook(page);
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Pick columns" })
      .click();
    await expect(popover(page).getByText("ID", { exact: true })).toHaveCount(1);
    await expect(
      popover(page).getByText("Products → ID", { exact: true }),
    ).toHaveCount(1);
    await expect(
      popover(page).getByText("Products - User → ID", { exact: true }),
    ).toHaveCount(1);
  });
});

test.describe("issue 39749", () => {
  const modelDetails = {
    type: "model" as const,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "year" },
        ],
      ],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should not overwrite the description of one column with the description of another column (metabase#39749)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, modelDetails);
    await visitModel(page, id);

    // edit metadata
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await tableHeaderClick(page, "Count");
    await page.getByLabel("Description").fill("A");
    await page.getByLabel("Description").blur();
    await tableHeaderClick(page, "Sum of Total");
    await expect(page.getByLabel("Description")).toHaveValue("");
    await page.getByLabel("Description").fill("B");
    await page.getByLabel("Description").blur();
    await tableHeaderClick(page, "Count");
    await expect(page.getByLabel("Description")).toHaveValue("A");
    await tableHeaderClick(page, "Sum of Total");
    await expect(page.getByLabel("Description")).toHaveValue("B");
    const updateModel = waitForCardUpdate(page);
    await saveChangesButton(page).click();
    await updateModel;

    // verify that the description was updated successfully
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await tableHeaderClick(page, "Count");
    await expect(page.getByLabel("Description")).toHaveValue("A");
    await tableHeaderClick(page, "Sum of Total");
    await expect(page.getByLabel("Description")).toHaveValue("B");
  });
});

test.describe("issue 25885", () => {
  const mbqlModelDetails = {
    type: "model" as const,
    query: {
      "source-table": ORDERS_ID,
      fields: [["field", ORDERS.ID, { "base-type": "type/BigInteger" }]],
      joins: [
        {
          fields: [
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders" },
            ],
          ],
          strategy: "left-join",
          alias: "Orders",
          condition: [
            "=",
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders" },
            ],
          ],
          "source-table": ORDERS_ID,
        },
        {
          fields: [
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders_2" },
            ],
          ],
          strategy: "left-join",
          alias: "Orders_2",
          condition: [
            "=",
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
            [
              "field",
              ORDERS.ID,
              { "base-type": "type/BigInteger", "join-alias": "Orders_2" },
            ],
          ],
          "source-table": ORDERS_ID,
        },
      ],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  async function setColumnName(page: Page, oldName: string, newName: string) {
    await tableHeaderClick(page, oldName);
    const displayName = page.getByLabel("Display name");
    await expect(displayName).toHaveValue(oldName);
    await displayName.fill("");
    await displayName.fill(newName);
    await displayName.blur();
    await expect(
      tableInteractive(page).getByText(newName, { exact: true }),
    ).toBeVisible();
  }

  async function verifyColumnName(page: Page, name: string) {
    await tableHeaderClick(page, name);
    await expect(page.getByLabel("Display name")).toHaveValue(name);
  }

  test("should allow to edit metadata for mbql models with self joins columns (metabase#25885)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, mbqlModelDetails);
    await visitModel(page, id);
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await setColumnName(page, "ID", "ID1");
    await setColumnName(page, "Orders → ID", "ID2");
    await setColumnName(page, "Orders_2 → ID", "ID3");
    await verifyColumnName(page, "ID1");
    await verifyColumnName(page, "ID2");
    await verifyColumnName(page, "ID3");
  });
});

test.describe("issue 33844", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
  });

  async function testModelMetadata(page: Page, isNew: boolean) {
    // make a column visible only in detail views
    await waitForLoaderToBeRemoved(page);
    await expect(
      tableInteractive(page).getByText("ID", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("detail-shortcut")).toHaveCount(0);
    await tableHeaderClick(page, "ID");
    await page.getByLabel("Detail views only").click();
    if (isNew) {
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const createModel = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/card",
      );
      await modal(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await createModel;
    } else {
      const updateModel = waitForCardUpdate(page);
      const dataset = waitForDataset(page);
      await saveChangesButton(page).click();
      await updateModel;
      await dataset;
    }
    await expect(
      tableInteractive(page).getByText("User ID", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(page).getByText("ID", { exact: true }),
    ).toHaveCount(0);
    await openObjectDetail(page, 0);
    await expect(
      modal(page).getByText("Quantity", { exact: true }),
    ).toBeVisible();
    await expect(
      modal(page).getByRole("heading", { name: "1", exact: true }),
    ).toBeVisible();
    await modal(page).getByLabel("Close", { exact: true }).click();

    // make the column visible in table views
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await tableHeaderClick(page, "ID");
    await expect(page.getByLabel("Detail views only")).toBeChecked();
    await page.getByLabel("Table and details views").click();
    const updateModel = waitForCardUpdate(page);
    const dataset = waitForDataset(page);
    await saveChangesButton(page).click();
    await updateModel;
    await dataset;
    await expect(
      tableInteractive(page).getByText("ID", { exact: true }),
    ).toBeVisible();
  }

  test("should show hidden PKs in model metadata editor and object details after creating a model (metabase#33844)", async ({
    page,
  }) => {
    await page.goto("/model/new");
    await page
      .getByTestId("new-model-options")
      .getByText("Use the notebook editor", { exact: true })
      .click();
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();
    const dataset = waitForDataset(page);
    await page.getByTestId("run-button").click();
    await dataset;
    await datasetEditBar(page).getByText("Columns", { exact: true }).click();
    await testModelMetadata(page, true);
  });

  test("should show hidden PKs in model metadata editor and object details after updating a model (metabase#33844,metabase#45924)", async ({
    page,
  }) => {
    await visitModel(page, ORDERS_QUESTION_ID);
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await testModelMetadata(page, false);
  });
});

test.describe("issue 45924", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
  });

  test("should preserve model metadata when re-running the query (metabase#45924)", async ({
    page,
  }) => {
    await visitModel(page, ORDERS_QUESTION_ID);
    await openQuestionActionsItem(page, /Edit metadata/);
    await waitForLoaderToBeRemoved(page);
    await tableHeaderClick(page, "ID");
    await page.getByLabel("Display name").fill("");
    await page.getByLabel("Display name").fill("ID1");
    await datasetEditBar(page).getByText("Query", { exact: true }).click();
    await page
      .getByTestId("action-buttons")
      .getByText("Sort", { exact: true })
      .click();
    await popover(page).getByText("ID", { exact: true }).click();
    const dataset = waitForDataset(page);
    await page.getByTestId("run-button").click();
    await dataset;
    await datasetEditBar(page).getByText("Columns", { exact: true }).click();
    await tableHeaderClick(page, "ID1");
    await expect(page.getByLabel("Display name")).toHaveValue("ID1");
    const updateCard = waitForCardUpdate(page);
    const dataset2 = waitForDataset(page);
    await saveChangesButton(datasetEditBar(page)).click();
    await updateCard;
    await dataset2;
    await expect(
      tableInteractive(page).getByText("ID1", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("issue 43088", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend (instance-analytics models)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should be able to create ad-hoc questions based on instance analytics models (metabase#43088)", async ({
    page,
  }) => {
    await page.goto("/");
    await navigationSidebar(page)
      .getByText("Usage analytics", { exact: true })
      .click();
    const people = getPinnedSection(page).getByText("People", { exact: true });
    await people.scrollIntoViewIfNeeded();
    const dataset = waitForDataset(page);
    await people.click();
    await dataset;
    await summarize(page);
    const dataset2 = waitForDataset(page);
    await rightSidebar(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await dataset2;
    await assertQueryBuilderRowCount(page, 1);
  });
});

test.describe("issue 34574", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  async function assertMarkdownPreview(editable: Locator) {
    await expect(
      editable.getByRole("heading", { level: 1, name: "Hello" }),
    ).toBeVisible();
    await expect(
      editable.getByRole("heading", { level: 2, name: "World" }),
    ).toBeVisible();
    await expect(editable.locator("strong")).toBeVisible();
    await expect(editable.locator("strong")).toHaveText("important");
  }

  test("should accept markdown for model description and render it properly (metabase#34574)", async ({
    page,
    mb,
  }) => {
    const { id: modelId } = await createQuestion(mb.api, {
      name: "34574",
      type: "model",
      query: { "source-table": PRODUCTS_ID, limit: 2 },
    });
    await visitModel(page, modelId);

    const panel = page.getByTestId("qb-header-action-panel");
    // make sure the model fully loaded
    await expect(panel.getByTestId("run-button")).toBeVisible();
    await questionInfoButton(page).click();

    const sheet = sidesheet(page);
    // Set the model description to a markdown text (EditableText markdown field —
    // real keystrokes; {enter} sequences become Enter presses)
    const description = sheet.getByPlaceholder("Add description");
    await description.click();
    await expect(description).toBeFocused();
    await page.keyboard.type("# Hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## World");
    await page.keyboard.press("Enter");
    await page.keyboard.type("This is an **important** description!");
    const updateCard = waitForCardUpdate(page);
    // Cypress commits with realPress("Tab"); EditableText's root onKeyDown
    // re-focuses the textarea on any non-Enter key (Tab included), so a
    // synthetic Tab bounces focus back in and never renders the markdown. Blur
    // the focused textarea directly — same commit, no bounce.
    await page.locator("textarea:focus").blur();
    await updateCard;

    // Make sure we immediately render the proper markdown. Scoped to the
    // sidesheet: the QB-header model title is also an `editable-text` (a
    // non-markdown field that always renders a textarea), and the original runs
    // inside H.sidesheet().within(...).
    await expect(
      sheet.getByTestId("editable-text").locator("textarea"),
    ).toHaveCount(0);
    await assertMarkdownPreview(sheet.getByTestId("editable-text"));
    await sheet.getByLabel("Close").click();

    // Make sure the description is present in the collection entry tooltip
    await page
      .getByTestId("app-bar")
      .getByText("Our analytics", { exact: true })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/collection/root");
    await page
      .getByTestId("collection-entry-name")
      .filter({ hasText: "34574" })
      .locator(".Icon-info")
      .hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText("Hello");
    await expect(tooltip).toContainText("World");
    await expect(tooltip).toContainText("This is an important description!");
  });
});

test.describe("issue 34517", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not change the url when reloading the page while editing a model (metabase#34517)", async ({
    page,
  }) => {
    await startNewModel(page);
    await expect(page).toHaveURL((url) => url.pathname === "/model/query");

    // wait for the model editor to be fully loaded
    await expect(miniPicker(page)).toBeVisible();
    await page.reload();

    // wait for the model editor to be fully loaded
    await expect(miniPicker(page)).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/model/query");
  });
});

test.describe("issue 35840", () => {
  const modelName = "M1";
  const questionName = "Q1";

  const modelDetails = {
    type: "model" as const,
    name: modelName,
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Category: ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      },
    },
  };

  const getQuestionDetails = (modelId: number) => ({
    type: "question" as const,
    name: questionName,
    query: {
      "source-table": `card__${modelId}`,
    },
  });

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  async function checkColumnMapping(page: Page, path: string[]) {
    await pickEntity(page, { path, select: true });
    await modal(page).getByPlaceholder("Pick a column…").click();
    await selectDropdown(page)
      .getByText("Category", { exact: true })
      .first()
      .click();
    await expect(await findByDisplayValue(modal(page), "Category")).toBeVisible();
    await expectNoDisplayValue(modal(page), "Category, Category");
  }

  test("should not confuse a model field with an expression that has the same name in dashboard parameter sources (metabase#35840)", async ({
    page,
    mb,
  }) => {
    // Setup dashboard
    const model = await createQuestion(mb.api, modelDetails);
    await createQuestion(mb.api, getQuestionDetails(model.id));
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await setFilter(page, "Text or Category", "Is");
    await setDropdownFilterType(page);
    await sidebar(page).getByText("Edit", { exact: true }).click();

    // Use model for dropdown source
    await modal(page)
      .getByText("From another model or question", { exact: true })
      .click();
    await modal(page)
      .getByText("Pick a model or question…", { exact: true })
      .click();
    await checkColumnMapping(page, ["Our analytics", modelName]);

    // Use model-based question for dropdown source
    await modal(page).getByText(modelName, { exact: true }).click();
    await checkColumnMapping(page, ["Our analytics", questionName]);
  });
});

test.describe("issue 34514", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // It's important to navigate via UI so that there are
    // enough entries in the browser history to go back to.
    await page.goto("/model/new");
    await page
      .getByTestId("new-model-options")
      .getByText("Use the notebook editor", { exact: true })
      .click();
  });

  async function assertQueryTabState(page: Page) {
    await expect(entityPickerModal(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    await expect(
      getNotebookStep(page, "data").getByText("Orders", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(page).getByText("39.72", { exact: true }),
    ).toBeVisible();
  }

  async function assertMetadataTabState(page: Page) {
    await expect(page.getByLabel("Description")).toBeVisible();
    await expect(page.getByLabel("Description")).toHaveValue(
      /This is a unique ID for the product\./,
    );
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
  }

  async function assertBackToEmptyState(page: Page) {
    await expect(miniPicker(page)).toBeVisible();

    await expect(page.getByTestId("editor-tabs-columns")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await expect(
      getNotebookStep(page, "data").getByPlaceholder(
        "Search for tables and more...",
      ),
    ).toBeVisible();
    await expect(tableInteractive(page)).toHaveCount(0);
    const vizRoot = page.getByTestId("query-visualization-root");
    await expect(
      vizRoot.getByText("We're experiencing server issues", { exact: true }),
    ).toHaveCount(0);
    await expect(
      vizRoot.getByText("Here's where your results will appear", {
        exact: true,
      }),
    ).toBeVisible();
  }

  test("should not make network request with invalid query (metabase#34514)", async ({
    page,
  }) => {
    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();

    const dataset = waitForDataset(page);
    await page.getByTestId("run-button").click();
    await dataset;
    await assertQueryTabState(page);

    await page.goBack();
    await assertBackToEmptyState(page);
  });

  test("should allow browser history navigation between tabs (metabase#34514, metabase#45787)", async ({
    page,
  }) => {
    const datasetCount = countDatasetRequests(page);

    await miniPicker(page).getByText("Sample Database", { exact: true }).click();
    await miniPicker(page).getByText("Orders", { exact: true }).click();

    const dataset = waitForDataset(page);
    await page.getByTestId("run-button").click();
    await dataset;
    await assertQueryTabState(page);

    await page.getByTestId("editor-tabs-columns-name").click();
    await assertMetadataTabState(page);
    expect(datasetCount()).toBe(1);

    await page.goBack();
    await assertQueryTabState(page);
    expect(datasetCount()).toBe(1);

    await page.goBack();
    await assertBackToEmptyState(page);
    expect(datasetCount()).toBe(1);
  });
});
