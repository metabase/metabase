const { H } = cy;

import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  PRODUCTS_COUNT_BY_CREATED_AT,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
  createDashboardWithVisualizerDashcards,
} from "e2e/support/test-visualizer-data";

describe("scenarios > dashboard > visualizer > drillthrough", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.signInAsNormalUser();

    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT, {
      idAlias: "ordersCountByCreatedAtQuestionId",
      wrapId: true,
    });
    H.createQuestion(ORDERS_COUNT_BY_PRODUCT_CATEGORY, {
      idAlias: "ordersCountByProductCategoryQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT, {
      idAlias: "productsCountByCreatedAtQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY, {
      idAlias: "productsCountByCategoryQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY_PIE, {
      idAlias: "productsCountByCategoryPieQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.LANDING_PAGE_VIEWS, {
      idAlias: "landingPageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.CHECKOUT_PAGE_VIEWS, {
      idAlias: "checkoutPageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS, {
      idAlias: "paymentDonePageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(STEP_COLUMN_CARD, {
      idAlias: "stepColumnQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(VIEWS_COLUMN_CARD, {
      idAlias: "viewsColumnQuestionId",
      wrapId: true,
    });
  });

  it("should work", () => {
    createDashboardWithVisualizerDashcards();

    const ORDERS_SERIES_COLOR = "#88BF4D";
    const PRODUCTS_SERIES_COLOR = "#A989C5";

    // 1. Cartesian chart, timeseries breakout
    const SEP_2022_POINT_INDEX = 5;

    H.getDashboardCard(0).within(() =>
      // eslint-disable-next-line no-unsafe-element-filtering
      H.cartesianChartCircleWithColor(PRODUCTS_SERIES_COLOR)
        .eq(SEP_2022_POINT_INDEX)
        .click(),
    );
    H.clickActionsPopover().findByText("See these Products").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Created At is Sep 1–30, 2022");
    H.assertQueryBuilderRowCount(9);
    H.tableInteractiveHeader().findByText("Price"); // ensure we're on the Products table

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(0).within(() => {
      // eslint-disable-next-line no-unsafe-element-filtering
      H.cartesianChartCircleWithColor(ORDERS_SERIES_COLOR)
        .eq(SEP_2022_POINT_INDEX)
        .click();
    });

    H.clickActionsPopover().findByText("Break out by…").click();
    H.clickActionsPopover().findByText("Category").click();
    H.clickActionsPopover().findByText("Source").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Created At is Sep 1–30, 2022");
    H.assertQueryBuilderRowCount(5);
    H.echartsContainer().within(() => {
      cy.findByText("Affiliate").should("exist");
      cy.findByText("Organic").should("exist");
      cy.findByText("Twitter").should("exist");
    });

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(0).within(() => H.chartLegendItem("Count").click());
    cy.wait("@cardQuery");
    H.queryBuilderHeader()
      .findByText(ORDERS_COUNT_BY_CREATED_AT.name)
      .should("exist");
    H.assertQueryBuilderRowCount(49);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(0).within(() =>
      H.chartLegendItem(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).click(),
    );
    cy.wait("@cardQuery");
    H.queryBuilderHeader()
      .findByText(PRODUCTS_COUNT_BY_CREATED_AT.name)
      .should("exist");
    H.assertQueryBuilderRowCount(37);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 2. Cartesian chart, category breakout
    H.getDashboardCard(1).within(() =>
      H.chartPathWithFillColor(ORDERS_SERIES_COLOR).eq(1).click(),
    );
    H.clickActionsPopover().findByText("See these Orders").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Product → Category is Gadget");
    H.tableInteractiveHeader().findByText("Subtotal"); // ensure we're on the Orders table

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(1).within(() =>
      H.chartPathWithFillColor(PRODUCTS_SERIES_COLOR).eq(0).click(),
    );
    H.clickActionsPopover().button(">").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Count is greater than 42");
    H.assertQueryBuilderRowCount(3);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 3. Pie chart
    H.getDashboardCard(2).within(() =>
      H.chartPathWithFillColor("#F2A86F").click(),
    );
    H.clickActionsPopover().findByText("See these Products").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Category is Widget");
    H.tableInteractiveHeader().findByText("Price"); // ensure we're on the Products table
    H.assertQueryBuilderRowCount(54);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 4. Funnel (regular)
    H.getDashboardCard(4).get("polygon").first().click();
    cy.wait(200); // HACK: wait for popover to appear
    H.clickActionsPopover().button("=").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Views is equal to 600");
    H.tableInteractiveHeader().findByText("Views").should("exist");
    H.assertQueryBuilderRowCount(1);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 5. Funnel (scalar)
    H.getDashboardCard(5).get("polygon").first().click();
    cy.wait(200); // HACK: wait for popover to appear
    H.clickActionsPopover().button("=").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Views is equal to 600");
    H.tableInteractiveHeader().findByText("Views").should("exist");
    H.assertQueryBuilderRowCount(1);
  });
});
