/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/funnels.cy.spec.ts
 *
 * Port notes:
 * - No gating tags upstream; runs on the EE spike backend.
 * - beforeEach creates 10 questions. Only the funnel tests read their names,
 *   not their ids (unlike cartesian, which builds a dashboard from the ids), so
 *   the questions are created for their side effect (they must exist so the
 *   questions sidebar / data importer can find them by name) and no id map is
 *   kept. The two never-awaited intercepts upstream (@dataset, @cardQuery,
 *   @dashcardQuery) are dropped — this spec never cy.wait()s them, and the
 *   shared selectDataset helper already waits on the card query internally.
 * - All `H.modal().within(...)` blocks become modal(page)-scoped locators; the
 *   well / data-importer helpers are the shared visualizer surface imported
 *   read-only from support/visualizer-basics.ts and support/visualizer-cartesian.ts.
 * - `cy.button("Add more data")` / `cy.button("Done")` map to the modal-scoped
 *   switchToAddMoreData / switchToColumnsList helpers (faithful, and safely
 *   scoped to the modal — the cartesian precedent does the same).
 * - No new helpers were needed: every fixture and UI helper this spec uses
 *   already exists in the two shared visualizer modules, so support/
 *   visualizer-funnels.ts was not created.
 */
import { expect, test } from "../support/fixtures";
import { editDashboard } from "../support/dashboard";
import { visitDashboard } from "../support/ui";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  PRODUCTS_COUNT_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  PRODUCTS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
  assertDataSourceColumnSelected,
  clickVisualizeAnotherWay,
  createNativeQuestion,
  createQuestion,
  dataImporter,
  deselectColumnFromColumnsList,
  horizontalWell,
  openQuestionsSidebar,
  selectDataset,
  selectVisualization,
  switchToAddMoreData,
  switchToColumnsList,
  verticalWell,
} from "../support/visualizer-basics";
import {
  dataSourceColumn,
  removeDataSource,
  selectColumnFromColumnsList,
} from "../support/visualizer-cartesian";

test.describe("scenarios > dashboard > visualizer > funnels", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const api = mb.api;
    await createQuestion(api, ORDERS_COUNT_BY_CREATED_AT);
    await createQuestion(api, ORDERS_COUNT_BY_PRODUCT_CATEGORY);
    await createQuestion(api, PRODUCTS_COUNT_BY_CREATED_AT);
    await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY);
    await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY_PIE);
    await createNativeQuestion(api, SCALAR_CARD.LANDING_PAGE_VIEWS);
    await createNativeQuestion(api, SCALAR_CARD.CHECKOUT_PAGE_VIEWS);
    await createNativeQuestion(api, SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS);
    await createNativeQuestion(api, STEP_COLUMN_CARD);
    await createNativeQuestion(api, VIEWS_COLUMN_CARD);
  });

  test("should build a funnel", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, STEP_COLUMN_CARD.name);

    await selectVisualization(page, "funnel");

    await switchToAddMoreData(page);
    await selectDataset(page, VIEWS_COLUMN_CARD.name);
    await switchToColumnsList(page);

    await assertDataSourceColumnSelected(page, STEP_COLUMN_CARD.name, "Step");
    await assertDataSourceColumnSelected(page, VIEWS_COLUMN_CARD.name, "Views");

    await expect(
      verticalWell(page).getByText("Views", { exact: true }),
    ).toBeVisible();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);

    await expect(
      horizontalWell(page).getByText("Step", { exact: true }),
    ).toBeVisible();
    await expect(
      horizontalWell(page).getByText("Checkout page", { exact: true }),
    ).toBeVisible();
    await expect(
      horizontalWell(page).getByText("Landing page", { exact: true }),
    ).toBeVisible();
    await expect(
      horizontalWell(page).getByText("Payment done page", { exact: true }),
    ).toBeVisible();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(4);

    // Remove a column from the data manager
    await dataSourceColumn(page, STEP_COLUMN_CARD.name, "Step")
      .getByLabel("Remove")
      .click();
    await assertDataSourceColumnSelected(
      page,
      STEP_COLUMN_CARD.name,
      "Step",
      false,
    );
    await expect(
      verticalWell(page).getByText("Views", { exact: true }),
    ).toBeVisible();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
    await expect(
      horizontalWell(page).getByText("(empty)", { exact: true }),
    ).toBeVisible();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);

    // Add a column back
    await dataSourceColumn(page, STEP_COLUMN_CARD.name, "Step").click();
    await assertDataSourceColumnSelected(page, STEP_COLUMN_CARD.name, "Step");
    await expect(
      verticalWell(page).getByText("Views", { exact: true }),
    ).toBeVisible();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
    await expect(
      horizontalWell(page).getByText("Step", { exact: true }),
    ).toBeVisible();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(4);

    // Remove the metric column from the well
    await verticalWell(page)
      .getByTestId("well-item")
      .getByLabel("Remove")
      .click();
    await assertDataSourceColumnSelected(
      page,
      VIEWS_COLUMN_CARD.name,
      "Views",
      false,
    );
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(0);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(4);

    // Remove the dimension column from the well
    await horizontalWell(page)
      .getByTestId("well-item")
      .first()
      .getByLabel("Remove")
      .click();
    await assertDataSourceColumnSelected(
      page,
      STEP_COLUMN_CARD.name,
      "Step",
      false,
    );
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(0);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(0);

    // Rebuild the funnel
    await dataSourceColumn(page, STEP_COLUMN_CARD.name, "Step").click();
    await dataSourceColumn(page, VIEWS_COLUMN_CARD.name, "Views").click();
    await assertDataSourceColumnSelected(page, STEP_COLUMN_CARD.name, "Step");
    await assertDataSourceColumnSelected(page, VIEWS_COLUMN_CARD.name, "Views");
    await expect(
      verticalWell(page).getByText("Views", { exact: true }),
    ).toBeVisible();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
    await expect(
      horizontalWell(page).getByText("Step", { exact: true }),
    ).toBeVisible();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(4);

    // Remove a data source
    await removeDataSource(page, VIEWS_COLUMN_CARD.name);
    await expect(
      dataImporter(page).getByText(VIEWS_COLUMN_CARD.name, { exact: true }),
    ).toHaveCount(0);
    await expect(
      dataImporter(page).getByText("Views", { exact: true }),
    ).toHaveCount(0);
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(0);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(4);
  });

  test("should build a funnel of several scalar cards", async ({
    page,
    mb,
  }) => {
    const { LANDING_PAGE_VIEWS, CHECKOUT_PAGE_VIEWS, PAYMENT_DONE_PAGE_VIEWS } =
      SCALAR_CARD;

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, LANDING_PAGE_VIEWS.name);

    await switchToAddMoreData(page);
    await selectDataset(page, CHECKOUT_PAGE_VIEWS.name);
    await selectDataset(page, PAYMENT_DONE_PAGE_VIEWS.name);
    await switchToColumnsList(page);

    await assertDataSourceColumnSelected(page, LANDING_PAGE_VIEWS.name, "views");
    await assertDataSourceColumnSelected(
      page,
      CHECKOUT_PAGE_VIEWS.name,
      "views",
    );
    await assertDataSourceColumnSelected(
      page,
      PAYMENT_DONE_PAGE_VIEWS.name,
      "views",
    );

    await expect(
      verticalWell(page).getByText("METRIC", { exact: true }),
    ).toHaveCount(0);

    await expect(
      horizontalWell(page).getByText("DIMENSION", { exact: true }),
    ).toHaveCount(0);
    await expect(
      horizontalWell(page).getByText(LANDING_PAGE_VIEWS.name, { exact: true }),
    ).toBeVisible();
    await expect(
      horizontalWell(page).getByText(CHECKOUT_PAGE_VIEWS.name, { exact: true }),
    ).toBeVisible();
    await expect(
      horizontalWell(page).getByText(PAYMENT_DONE_PAGE_VIEWS.name, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(3);

    // Remove a column from the data manager
    await deselectColumnFromColumnsList(page, CHECKOUT_PAGE_VIEWS.name, "views");
    await assertDataSourceColumnSelected(
      page,
      CHECKOUT_PAGE_VIEWS.name,
      "views",
      false,
    );
    await expect(
      verticalWell(page).getByText("METRIC", { exact: true }),
    ).toHaveCount(0);
    await expect(
      horizontalWell(page).getByText("DIMENSION", { exact: true }),
    ).toHaveCount(0);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(2);

    // Add a column back
    await selectColumnFromColumnsList(page, CHECKOUT_PAGE_VIEWS.name, "views");
    await assertDataSourceColumnSelected(
      page,
      CHECKOUT_PAGE_VIEWS.name,
      "views",
    );
    await expect(
      verticalWell(page).getByText("METRIC", { exact: true }),
    ).toHaveCount(0);
    await expect(
      horizontalWell(page).getByText("DIMENSION", { exact: true }),
    ).toHaveCount(0);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(3);

    await deselectColumnFromColumnsList(page, LANDING_PAGE_VIEWS.name, "views");
    await deselectColumnFromColumnsList(page, CHECKOUT_PAGE_VIEWS.name, "views");
    await deselectColumnFromColumnsList(
      page,
      PAYMENT_DONE_PAGE_VIEWS.name,
      "views",
    );

    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(0);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(0);

    // Rebuild the funnel
    await selectColumnFromColumnsList(page, LANDING_PAGE_VIEWS.name, "views");
    await selectColumnFromColumnsList(page, CHECKOUT_PAGE_VIEWS.name, "views");
    await selectColumnFromColumnsList(
      page,
      PAYMENT_DONE_PAGE_VIEWS.name,
      "views",
    );

    await assertDataSourceColumnSelected(page, LANDING_PAGE_VIEWS.name, "views");
    await assertDataSourceColumnSelected(
      page,
      CHECKOUT_PAGE_VIEWS.name,
      "views",
    );
    await assertDataSourceColumnSelected(
      page,
      PAYMENT_DONE_PAGE_VIEWS.name,
      "views",
    );

    await expect(
      verticalWell(page).getByText("METRIC", { exact: true }),
    ).toHaveCount(0);
    await expect(
      horizontalWell(page).getByText("DIMENSION", { exact: true }),
    ).toHaveCount(0);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(3);
  });

  test("should initialize a scalar funnel when opening a scalar card (VIZ-678)", async ({
    page,
    mb,
  }) => {
    const { LANDING_PAGE_VIEWS, CHECKOUT_PAGE_VIEWS, PAYMENT_DONE_PAGE_VIEWS } =
      SCALAR_CARD;

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, LANDING_PAGE_VIEWS.name);

    await switchToAddMoreData(page);
    await selectDataset(page, CHECKOUT_PAGE_VIEWS.name);
    await selectDataset(page, PAYMENT_DONE_PAGE_VIEWS.name);

    await expect(
      verticalWell(page).getByText("METRIC", { exact: true }),
    ).toHaveCount(0);

    await expect(
      horizontalWell(page).getByText("DIMENSION", { exact: true }),
    ).toHaveCount(0);
    await expect(
      horizontalWell(page).getByText(LANDING_PAGE_VIEWS.name, { exact: true }),
    ).toBeVisible();
    await expect(
      horizontalWell(page).getByText(CHECKOUT_PAGE_VIEWS.name, { exact: true }),
    ).toBeVisible();
    await expect(
      horizontalWell(page).getByText(PAYMENT_DONE_PAGE_VIEWS.name, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(3);
  });
});
