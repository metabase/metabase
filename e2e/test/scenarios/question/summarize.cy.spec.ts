const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const OFFSET_SUM_TOTAL_AGGREGATION_NAME = "Offsetted sum of total";

describe("scenarios > question > summarize sidebar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitQuestion(ORDERS_QUESTION_ID);
    H.summarize();
  });

  it("should only have one scrollbar for the summarize sidebar and show the binning of selected and hovered dimensions (metabase#45452)", () => {
    cy.findByTestId("summarize-aggregation-item-list").then(($el) => {
      expectNoScrollbar($el[0]);
    });

    cy.findByTestId("summarize-breakout-column-list").then(($el) => {
      expectNoScrollbar($el[0]);
    });

    // the sidebar is the only element with a scrollbar
    cy.findByTestId("sidebar-content").then(($el) => {
      const element = $el[0];
      expect(element.scrollHeight > element.clientHeight).to.be.true;
      expect(element.offsetWidth > element.clientWidth).to.be.true;
    });

    cy.log("the binning of a selected dimension is visible without hovering");
    H.getDimensionByName({ name: "Total" }).click({ position: "left" });
    H.changeBinningForDimension({
      name: "Quantity",
      toBinning: "10 bins",
    });
    H.getDimensionByName({ name: "Total" })
      .scrollIntoView()
      .should("have.attr", "aria-selected", "true")
      .findByLabelText("Binning strategy")
      .should("be.visible");
    H.getDimensionByName({ name: "Quantity" })
      .should("have.attr", "aria-selected", "true")
      .findByLabelText("Binning strategy")
      .should("be.visible");

    cy.log("the binning of another dimension is visible on hover");
    H.getDimensionByName({ name: "Discount" }).within(() => {
      cy.button("Add dimension").realHover();
      cy.findByLabelText("Binning strategy").should("be.visible");
    });
  });

  it("should not show the run button overlay when the query fails (metabase#12586)", () => {
    cy.intercept("POST", "/api/dataset", (req) => req.destroy());

    H.rightSidebar().button("Done").click();
    H.main()
      .findByText("We're experiencing server issues")
      .should("be.visible");
    cy.findByTestId("query-builder-main").icon("play").should("not.be.visible");
  });
});

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  it("works after saving a question (metabase#42323)", () => {
    const breakoutName = "Created At";

    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    addCustomAggregation({
      formula: "Offset(Sum([Total]), -1)",
      name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      isFirst: true,
    });
    addBreakout(breakoutName);

    H.visualize();
    verifyLineChart({
      xAxis: breakoutName + ": Month",
      yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
    });
    verifyNoQuestionError();

    saveQuestion().then(({ response }) => {
      H.visitQuestion(response?.body.id);
      verifyLineChart({
        xAxis: breakoutName + ": Month",
        yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });
      verifyNoQuestionError();
    });
  });

  it("should create filter and CC with offset aggregation and sort correctly", () => {
    H.openTable({ table: ORDERS_ID });

    H.openNotebook();

    H.summarize({ mode: "notebook" });
    addCustomAggregation({
      formula: "Offset(Sum([Total]), -1)",
      name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      isOpened: true,
    });

    H.addSummaryGroupingField({ field: "Created At" });
    H.addSummaryGroupingField({
      table: "Product",
      field: "Category",
    });
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByLabelText("Custom column").last().click();

    H.enterCustomColumnDetails({
      formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] * 2`,
      name: `${OFFSET_SUM_TOTAL_AGGREGATION_NAME} * 2`,
    });
    H.popover().findByText("Done").click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("action-buttons").last().icon("filter").click();
    H.popover().findByText("Custom Expression").click();

    H.enterCustomColumnDetails({
      formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] > 1000`,
    });
    H.popover().findByText("Done").click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("action-buttons").last().icon("sort").click();
    H.popover().findByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME).click();
    H.getNotebookStep("sort", { stage: 1, index: 0 })
      .findByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME)
      .click();

    H.visualize();

    verifyTableContent([
      ["April 2028", "Gadget", "15,713", "31,426.01"],
      ["September 2028", "Gadget", "15,017.31", "30,034.62"],
    ]);
    verifyNoQuestionError();
  });

  it("should work with metrics (metabase#47854)", () => {
    const metricName = "Count of orders";
    const ORDERS_SCALAR_METRIC: StructuredQuestionDetails = {
      name: metricName,
      type: "metric",
      description: "A metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      },
      display: "scalar",
    };

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      H.createQuestion(
        {
          name: "Question with metric",
          type: "question",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["metric", metric.id]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "temporal-unit": "month",
                },
              ],
            ],
          },
          display: "line",
        },
        { visitQuestion: true },
      );
    });

    H.openNotebook();

    addCustomAggregation({
      formula: `Offset([${metricName}], -1)`,
      name: "Count of orders (previous month)",
    });

    H.visualize();

    H.echartsContainer().within(() => {
      cy.contains("April 2027").should("be.visible");
    });
    verifyLineChart({
      xAxis: "Created At: Month",
      legendItems: [metricName, "Count of orders (previous month)"],
    });
  });
});

describe("scenarios > question > nested", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("'distribution' should work on a joined table from a saved question (metabase#14787)", () => {
    // Set the display really wide and really tall to avoid any scrolling
    cy.viewport(1600, 1200);
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.createQuestion({
      name: "14787",
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
        limit: 5,
      },
    }).then(({ body: { id } }) =>
      H.createQuestion(
        {
          name: "Nested Question",
          query: { "source-table": `card__${id}` },
        },
        { visitQuestion: true },
      ),
    );

    // The column title
    H.tableHeaderClick("Products → Category");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Distribution").click();
    cy.wait("@dataset");

    H.summarize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by")
      .parent()
      .within(() => {
        cy.log("Regression that worked on 0.37.9");
        isSelected("Products → Category");
      });

    // Although the test will fail on the previous step, we're including additional safeguards against regressions once the issue is fixed
    // It can potentially fail at two more places. See [1] and [2]
    H.openNotebook();
    cy.findAllByTestId("notebook-cell-item")
      .contains(/^Products → Category$/) /* [1] */
      .click();
    H.popover().within(() => {
      isSelected("Products → Category"); /* [2] */
    });

    function isSelected(text: string) {
      H.getDimensionByName({ name: text }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    }
  });

  it("should properly work with native questions (metabase#15808, metabase#16938, metabase#18364)", () => {
    H.createNativeQuestion(
      {
        name: "15808",
        native: { query: "select * from products limit 3" },
      },
      { visitQuestion: true },
    );
    cy.findAllByTestId("cell-data").should(
      "contain",
      "Swaniawski, Casper and Hilll",
    );

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.findByTestId("qb-header-action-panel")
      .findByText("Explore results")
      .click();
    cy.wait("@dataset");

    cy.log(
      "Should allow to browse object details when exploring native query results (metabase#16938)",
    );
    cy.get(".test-Table-ID").as("primaryKeys").should("have.length", 3);
    cy.get("@primaryKeys").first().click();

    cy.findByTestId("object-detail").should(
      "contain",
      "Swaniawski, Casper and Hilll",
    );
    cy.findByLabelText("Close").click();

    cy.log("Should be able to save a nested question (metabase#18364)");
    cy.intercept("POST", "/api/card").as("cardCreated");
    H.saveQuestionToCollection();
    cy.wait("@cardCreated");
    cy.location("pathname").should("match", /^\/question\/\d+/);
    cy.findByTestId("save-question-modal").should("not.exist");

    cy.log(
      "Should be able to use integer filter on a nested query based on a saved native question (metabase#15808)",
    );
    H.filter();
    H.popover().findByText("RATING").click();
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("4");
      cy.button("Apply filter").click();
    });

    cy.findAllByTestId("cell-data")
      .should("contain", "Murray, Watsica and Wunsch")
      .and("not.contain", "Swaniawski, Casper and Hilll");
  });
});

describe("scenarios > question > null", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("pie chart should handle `0`/`null` values (metabase#13626)", () => {
    // Preparation for the test: "Arrange and Act phase" - see repro steps in #13626
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "13626",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["expression", "NewDiscount"]]],
          breakout: [["field", ORDERS.ID, null]],
          expressions: {
            NewDiscount: [
              "case",
              [[["=", ["field", ORDERS.ID, null], 2], 0]],
              { default: ["field", ORDERS.DISCOUNT, null] },
            ],
          },
          filter: ["=", ["field", ORDERS.ID, null], 1, 2, 3],
        },
        display: "pie",
      },
      dashboardDetails: {
        name: "13626D",
        parameters: [
          {
            id: "1f97c149",
            name: "ID",
            slug: "id",
            type: "id",
          },
        ],
      },
    }).then(({ body: { dashboard_id }, questionId: card_id }) => {
      H.addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          size_x: 12,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: "1f97c149",
              card_id,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
        },
      });

      // NOTE: The actual "Assertion" phase begins here
      cy.visit(`/dashboard/${dashboard_id}?id=1`);
      cy.findByDisplayValue("13626D");

      cy.log("Reported failing in v0.37.0.2");
      cy.findByTestId("dashcard-container").within(() => {
        cy.findByTestId("loading-indicator").should("not.exist");
        cy.findByTestId("legend-caption-title").should("have.text", "13626");
        cy.findByText("Total").should("be.visible");
        cy.findByText("0").should("be.visible");
      });
    });
  });

  it("dashboard should handle cards with null values (metabase#13801)", () => {
    H.createNativeQuestion({
      name: "13801_Q1",
      native: { query: "SELECT null", "template-tags": {} },
      display: "scalar",
    }).then(({ body: { id: Q1_ID } }) => {
      H.createNativeQuestion({
        name: "13801_Q2",
        native: { query: "SELECT 0", "template-tags": {} },
        display: "scalar",
      }).then(({ body: { id: Q2_ID } }) => {
        H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("Add both previously created questions to the dashboard");

          H.updateDashboardCards({
            dashboard_id: DASHBOARD_ID,
            cards: [
              { card_id: Q1_ID, row: 0, col: 0, size_x: 8, size_y: 4 },
              { card_id: Q2_ID, row: 0, col: 6, size_x: 8, size_y: 4 },
            ],
          });

          H.visitDashboard(DASHBOARD_ID);
          cy.log("P0 regression in v0.37.1!");
          H.getDashboardCard(1).within(() => {
            cy.findByText("13801_Q2").should("be.visible");
            cy.findByTestId("scalar-value").should("have.text", "0");
          });
          H.getDashboardCard(0).within(() => {
            cy.findByText("13801_Q1").should("be.visible");
            cy.findByTestId("scalar-value").should("exist");
            cy.findByTestId("loading-indicator").should("not.exist");
          });
        });
      });
    });
  });

  it("should filter by clicking on the row with `null` value (metabase#18386)", () => {
    H.openOrdersTable();
    const findGridcell = (text: string) =>
      cy.findByRole("grid").findByRole("gridcell", { name: text });

    findGridcell("49.21").should("be.visible");
    cy.intercept("POST", "/api/dataset").as("dataset");

    // Total of "39.72", and the next cell is the `discount` (which is empty)
    findGridcell("39.72")
      .next()
      .find("div")
      .should("be.empty")
      // Open the context menu that lets us apply filter using this column directly
      .click({ force: true });

    H.popover().contains("=").click();
    cy.wait("@dataset");
    cy.findByTestId("filter-pill").should("contain.text", "Discount is empty");

    findGridcell("39.72").should("be.visible");
    // This row ([id] 3) had the `discount` column value and should be filtered out now
    findGridcell("49.21").should("not.exist");
  });

  it("summarize with null values (metabase#12585)", () => {
    H.openOrdersTable();

    H.summarize();
    H.rightSidebar().within(() => {
      // remove pre-selected "Count"
      cy.icon("close").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add a function or metric").click();
    // dropdown immediately opens with the new set of metrics to choose from
    H.popover().within(() => {
      cy.findByText("Cumulative sum of ...").click();
      cy.findByText("Discount").click();
    });
    // Group by
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Created At").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Cumulative sum of Discount by Created At: Month");

    H.cartesianChartCircle().should("have.length.of.at.least", 40);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
  });
});

function expectNoScrollbar(element: HTMLElement) {
  const { borderLeftWidth, borderRightWidth } = getComputedStyle(element);
  const scrollbarWidth =
    element.offsetWidth -
    element.clientWidth -
    parseFloat(borderLeftWidth) -
    parseFloat(borderRightWidth);

  expect(scrollbarWidth).to.equal(0);
}

function addCustomAggregation({
  formula,
  name,
  isFirst,
  isOpened,
}: {
  formula: string;
  name: string;
  isFirst?: boolean;
  isOpened?: boolean;
}) {
  if (!isOpened) {
    if (isFirst) {
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
    } else {
      H.getNotebookStep("summarize").icon("add").first().click();
    }
  }

  H.popover().findByText("Custom Expression").click();
  H.enterCustomColumnDetails({ formula, name });
  H.popover().button("Done").click();
}

function addBreakout(name: string) {
  H.getNotebookStep("summarize")
    .findByText("Pick a column to group by")
    .click();
  H.popover().findByText(name).click();
}

function saveQuestion() {
  cy.button("Save").click();
  H.modal().button("Save").click();
  return cy.wait("@saveQuestion");
}

function verifyLineChart({
  xAxis,
  yAxis,
  legendItems,
}: {
  xAxis: string;
  yAxis?: string;
  legendItems?: string[];
}) {
  H.echartsContainer().within(() => {
    cy.findByText(xAxis).should("be.visible");

    if (yAxis) {
      cy.findByText(yAxis).should("be.visible");
    }
  });

  if (legendItems) {
    for (const legendItem of legendItems) {
      cy.findAllByTestId("legend-item").contains(legendItem).should("exist");
    }
  }
}

function verifyTableContent(dataRows: string[][]) {
  const columnsCount = dataRows[0].length;
  const pairs = dataRows.flatMap((row, rowIndex) => {
    return row.map((text, cellIndex) => {
      const index = rowIndex * columnsCount + cellIndex;
      return { index, text };
    });
  });

  for (const { index, text } of pairs) {
    verifyTableCellContent(index, text);
  }
}

function verifyTableCellContent(index: number, text: string) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.tableInteractiveBody()
    .findByTestId("center-center-quadrant")
    .findAllByRole("gridcell")
    .eq(index)
    .should("have.text", text);
}

function verifyNoQuestionError() {
  cy.findByTestId("query-builder-main").within(() => {
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.findByText("Show error details").should("not.exist");
  });
}
