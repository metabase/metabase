import {
  restore,
  popover,
  visualize,
  openOrdersTable,
  visitQuestionAdhoc,
  changeBinningForDimension,
  getBinningButtonForDimension,
  getNotebookStep,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

describe("binning related reproductions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // This is basically covered with tests in `frontend/test/metabase/scenarios/binning/binning-options.cy.spec.js`
  it("should not render duplicated values in date binning popover (metabase#15574)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Pick a column to group by").click();

    changeBinningForDimension({
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Minute",
    });
  });

  it("binning for a date column on a joined table should offer only a single set of values (metabase#15446)", () => {
    cy.createQuestion({
      name: "15446",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              [
                "field",
                PRODUCTS.ID,
                {
                  "join-alias": "Products",
                },
              ],
            ],
            alias: "Products",
          },
        ],
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    cy.findByText("Pick a column to group by").click();
    // In the first popover we'll choose the breakout method
    popover().within(() => {
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("cr");
    });

    changeBinningForDimension({
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Minute",
    });

    // Given that the previous step passes, we should now see this in the UI
    cy.findByText("User → Created At: Minute");
  });

  it("shouldn't render double binning options when question is based on the saved native question (metabase#16327)", () => {
    cy.createNativeQuestion({
      name: "16327",
      native: { query: "select * from products limit 5" },
    });

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("16327").click();

    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Count of rows").click();

    cy.findByText("Pick a column to group by").click();
    cy.findByText(/CREATED_AT/i).realHover();
    cy.findByText("by minute").click({ force: true });

    // Implicit assertion - it fails if there is more than one instance of the string, which is exactly what we need for this repro
    cy.findByText("Month");
  });

  it("should be able to update the bucket size / granularity on a field that has sorting applied to it (metabase#16770)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
          "order-by": [
            ["asc", ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
          ],
        },
        type: "query",
      },
      display: "line",
    });

    cy.wait("@dataset");

    cy.contains("Summarize").click();

    changeBinningForDimension({
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Year",
      isSelected: true,
    });

    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });

    cy.findByText("Count by Created At: Year");
    cy.findByText("2018");
  });

  it("should not remove order-by (sort) when changing the breakout field on an SQL saved question (metabase#17975)", () => {
    cy.createNativeQuestion(
      {
        name: "17975",
        native: {
          query: "SELECT * FROM ORDERS",
        },
      },
      { loadMetadata: true },
    );

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("17975").click();

    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("CREATED_AT").click();

    cy.findByText("Sort").click();
    cy.findByText("CREATED_AT").click();

    // Change the binning of the breakout field
    cy.findByText("CREATED_AT: Month").click();
    cy.findByText("by month").click();
    cy.findByText("Quarter").click();

    cy.findByText("CREATED_AT");
  });

  it("should render binning options when joining on the saved native question (metabase#18646)", () => {
    cy.createNativeQuestion(
      {
        name: "18646",
        native: { query: "select * from products" },
      },
      { loadMetadata: true },
    );

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();

    cy.icon("join_left_outer").click();

    popover().within(() => {
      cy.findByText("Sample Dataset").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("18646").click();
    });

    selectFromDropdown("Created At");

    popover().within(() => {
      cy.findByText("CREATED_AT")
        .closest(".List-item")
        .findByText("by month")
        .click({ force: true });
    });

    cy.findByText("Day").click();

    // Joining on ID too to speed up query
    getNotebookStep("join").within(() => {
      cy.icon("add").click();
    });
    selectFromDropdown("Product ID");
    selectFromDropdown("ID");

    cy.findByTestId("join-strategy-control").click();
    selectFromDropdown("Inner join");

    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Count of rows").click();

    cy.findByText("Pick a column to group by").click();
    cy.findByText(/Question \d/).click();

    popover().within(() => {
      cy.findByText("CREATED_AT")
        .closest(".List-item")
        .findByText("by month");
    });

    visualize();
    cy.get(".ScalarValue").contains("16");
  });

  describe("binning should work on nested question based on question that has aggregation (metabase#16379)", () => {
    beforeEach(() => {
      cy.createQuestion({
        name: "16379",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.SUBTOTAL, null]]],
          breakout: [["field", ORDERS.USER_ID, null]],
        },
      }).then(({ body }) => {
        cy.intercept("POST", `/api/card/${body.id}/query`).as("cardQuery");
        cy.visit(`/question/${body.id}`);

        // Wait for `result_metadata` to load
        cy.wait("@cardQuery");
      });
    });

    it("should work for simple question", () => {
      openSummarizeOptions("Simple question");
      changeBinningForDimension({
        name: "Average of Subtotal",
        fromBinning: "Auto binned",
        toBinning: "10 bins",
      });

      cy.get(".bar");
    });

    it("should work for custom question", () => {
      openSummarizeOptions("Custom question");

      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();

      changeBinningForDimension({
        name: "Average of Subtotal",
        fromBinning: "Auto binned",
        toBinning: "10 bins",
      });

      visualize();

      cy.get(".bar");
    });
  });

  describe.skip("result metadata issues", () => {
    /**
     * Issues that arise only when we save SQL question without running it first.
     * It doesn't load the necessary metadata, which results in the wrong binning results.
     *
     * Fixing the underlying issue with `result_metadata` will most likely fix all three issues reproduced here.
     * Unskip the whole `describe` block once the fix is ready.
     */

    beforeEach(() => {
      // This query is the equivalent of saving the question without running it first.
      cy.createNativeQuestion({
        name: "SQL Binning",
        native: {
          query:
            "SELECT ORDERS.CREATED_AT, ORDERS.TOTAL, PEOPLE.LONGITUDE FROM ORDERS JOIN PEOPLE ON orders.user_id = people.id",
        },
      });

      cy.intercept("POST", "/api/dataset").as("dataset");

      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("SQL Binning").click();
      cy.findByText("Summarize").click();
      cy.wait("@dataset");
    });

    it("should render number auto binning correctly (metabase#16670)", () => {
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("TOTAL").click();
      });

      cy.wait("@dataset");

      cy.findByText("Count by TOTAL: Auto binned");
      cy.get(".bar").should("have.length.of.at.most", 10);

      cy.findByText("-60");
    });

    it("should render time series auto binning default bucket correctly (metabase#16671)", () => {
      getBinningButtonForDimension({ name: "CREATED_AT" }).should(
        "have.text",
        "by month",
      );
    });

    it("should work for longitude (metabase#16672)", () => {
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("LONGITUDE").click();
      });

      cy.wait("@dataset").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });

      cy.findByText("Count by LONGITUDE: Auto binned");
      cy.findByText("170° W");
    });
  });
});

function openSummarizeOptions(questionType) {
  cy.visit("/question/new");
  cy.findByText(questionType).click();
  cy.findByText("Saved Questions").click();
  cy.findByText("16379").click();
  cy.findByText("Summarize").click();
}

function selectFromDropdown(optionName) {
  popover()
    .findByText(optionName)
    .click();
}
