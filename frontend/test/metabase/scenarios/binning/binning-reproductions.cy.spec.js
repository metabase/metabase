import {
  restore,
  popover,
  openOrdersTable,
  visitQuestionAdhoc,
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
    popover()
      .findByText("Created At")
      .closest(".List-item")
      .findByText("by month")
      .click({ force: true });
    cy.findByText("Minute");
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
      cy.findByText("Created At")
        .closest(".List-item")
        .findByText("by month")
        .click({ force: true });
    });
    // The second popover shows up and offers binning options
    popover()
      .last()
      .within(() => {
        cy.findByText("Hour of day").scrollIntoView();
        // This is an implicit assertion - test fails when there is more than one string when using `findByText` instead of `findAllByText`
        cy.findByText("Minute").click();
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

  it.skip("should be able to update the bucket size / granularity on a field that has sorting applied to it (metabase#16770)", () => {
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
    cy.get(".List-item--selected")
      .contains("by month")
      .click();

    popover().within(() => {
      cy.findByText("Year").click();
    });

    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });

    cy.findByText("Count by Created At: Year");
    cy.findByText("2018");
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
      });
    });

    it("should work for simple question", () => {
      openSummarizeOptions("Simple question");
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Average of Subtotal")
          .closest(".List-item")
          .findByText("Auto binned")
          .click({ force: true });
      });

      popover().within(() => {
        cy.findByText("50 bins").click();
      });

      cy.get(".bar");
    });

    it("should work for custom question", () => {
      openSummarizeOptions("Custom question");

      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();

      popover().within(() => {
        cy.findByText("Average of Subtotal")
          .closest(".List-item")
          .findByText("Auto binned")
          .click({ force: true });
      });

      popover()
        .last()
        .within(() => {
          cy.findByText("50 bins").click();
        });

      cy.button("Visualize").click();
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
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("CREATED_AT")
          .closest(".List-item")
          .should("contain", "by month");
      });
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
