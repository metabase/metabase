const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import { checkNotNull } from "metabase/utils/types";
import { uuid } from "metabase/utils/uuid";
import type { FieldReference } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_TOTAL_FIELD_REF: FieldReference = [
  "field",
  ORDERS.TOTAL,
  { "base-type": "type/Float" },
];

const ORDERS_CREATED_AT_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

const SUM_TOTAL_AGGREGATION = ["sum", ORDERS_TOTAL_FIELD_REF];

const OFFSET_SUM_TOTAL_AGGREGATION_NAME = "Offsetted sum of total";

const OFFSET_SUM_TOTAL_AGGREGATION = [
  "offset",
  createOffsetOptions(OFFSET_SUM_TOTAL_AGGREGATION_NAME),
  SUM_TOTAL_AGGREGATION,
  -1,
];

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
  });

  describe("aggregations", () => {
    it("works with a single breakout", () => {
      const query = {
        "source-table": ORDERS_ID,
        aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
        breakout: [ORDERS_CREATED_AT_BREAKOUT],
        limit: 5,
      };

      H.createQuestion({ query }, { visitQuestion: true });

      verifyTableContent([
        ["April 2025", ""],
        ["May 2025", "52.76"],
      ]);
      verifyNoQuestionError();

      H.openNotebook();
      H.getNotebookStep("summarize").icon("play").should("be.visible");
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
    }).then(({ body: { id } }) => {
      H.createQuestion(
        {
          name: "Nested Question",
          query: { "source-table": `card__${id}` },
        },
        { visitQuestion: true },
      );
    });

    // The column title
    H.tableHeaderClick("Products → Category");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Distribution").click();
    cy.wait("@dataset");

    H.summarize();

    cy.log("Regression that worked on 0.37.9");
    H.summaryWellItem("columns", "Products → Category").should("be.visible");

    // It can potentially fail at two more places. See [1] and [2]
    H.openNotebook();
    cy.findAllByTestId("notebook-cell-item")
      .contains(/^Products → Category$/) /* [1] */
      .click();
    H.popover().within(() => {
      H.getDimensionByName({
        name: "Products → Category",
        isSelected: undefined,
      }).should("have.attr", "aria-selected", "true"); /* [2] */
    });
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

  it("should display rows whose value is `null` (metabase#13571)", () => {
    H.createQuestion({
      name: "13571",
      query: {
        "source-table": ORDERS_ID,
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.DISCOUNT, null],
        ],
        filter: ["=", ["field", ORDERS.ID, null], 1],
      },
    });

    // find and open previously created question
    cy.visit("/collection/root");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("13571").click();

    cy.log("'No Results since at least v0.34.3");
    H.openObjectDetail(0);
    cy.findByRole("dialog").within(() => {
      cy.findByText(/Discount/i).should("be.visible");
      cy.findByText("empty").should("be.visible");
    });
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
    }).then(({ body: { card_id: cardId, dashboard_id } }) => {
      const card_id = checkNotNull(cardId);
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
});

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

function createOffsetOptions(name = "offset") {
  return {
    "lib/uuid": uuid(),
    name,
    "display-name": name,
  };
}
