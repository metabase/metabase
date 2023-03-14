import {
  restore,
  popover,
  visualize,
  visitQuestionAdhoc,
  changeBinningForDimension,
  getBinningButtonForDimension,
  startNewQuestion,
  summarize,
  openOrdersTable,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("binning related reproductions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't render double binning options when question is based on the saved native question (metabase#16327)", () => {
    cy.createNativeQuestion({
      name: "16327",
      native: { query: "select * from products limit 5" },
    });

    startNewQuestion();
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
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
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

    summarize();

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

    startNewQuestion();
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

    openOrdersTable({ mode: "notebook" });

    cy.icon("join_left_outer").click();

    popover().within(() => {
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("Saved Questions").click();
      cy.findByText("18646").click();
    });

    popover().findByText("Product ID").click();

    popover().within(() => {
      cy.findByText("ID").click();
    });

    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();

    cy.findByText("Pick a column to group by").click();
    cy.findByText(/Question \d/).click();

    popover().within(() => {
      cy.findByText("CREATED_AT").closest(".List-item").findByText("by month");

      cy.findByText("CREATED_AT").click();
    });

    cy.findByText("Question 4 → Created At: Month");

    visualize();
    cy.get("circle");
  });

  it("should display date granularity on Summarize when opened from saved question (metabase#11439)", () => {
    // save "Orders" as question
    cy.createQuestion({
      name: "11439",
      query: { "source-table": ORDERS_ID },
    });

    // it is essential for this repro to find question following these exact steps
    // (for example, visiting `/collection/root` would yield different result)
    startNewQuestion();
    cy.findByText("Saved Questions").click();
    cy.findByText("11439").click();
    visualize();

    summarize();

    cy.findByText("Group by")
      .parent()
      .within(() => {
        cy.log("Reported failing since v0.33.5.1");
        cy.log(
          "**Marked as regression of [#10441](https://github.com/metabase/metabase/issues/10441)**",
        );

        cy.findAllByText("Created At")
          .eq(0)
          .closest("li")
          .contains("by month")
          // realHover() or mousemove don't work for whatever reason
          // have to use this ugly hack for now
          .click({ force: true });
      });
    // // this step is maybe redundant since it fails to even find "by month"
    cy.findByText("Hour of Day");
  });

  it("shouldn't duplicate the breakout field (metabase#22382)", () => {
    const questionDetails = {
      name: "22382",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    };

    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion(questionDetails, { visitQuestion: true });

    // Open settings through viz type picker to ensure "Table ptions" is in the sidebar.
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("Table-button").click();
      cy.findByTextEnsureVisible("Table options");
      cy.findByText("Created At: Month")
        .siblings("[data-testid$=hide-button]")
        .click();
      cy.button("Done").click();
    });

    summarize();

    cy.findByTestId("pinned-dimensions")
      .should("contain", "Created At")
      .find(".Icon-close")
      .click();
    cy.wait("@dataset");

    cy.get(".Visualization").findByText("Count");

    cy.findByTestId("sidebar-right")
      .findAllByText("Created At")
      .first()
      .click();
    cy.wait("@dataset");

    cy.get(".Visualization").within(() => {
      // ALl of these are implicit assertions and will fail if there's more than one string
      cy.findByText("Count");
      cy.findByText("Created At: Month");
      cy.findByText("June, 2016");
    });
  });

  describe("binning should work on nested question based on question that has aggregation (metabase#16379)", () => {
    beforeEach(() => {
      cy.createQuestion(
        {
          name: "16379",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["avg", ["field", ORDERS.SUBTOTAL, null]]],
            breakout: [["field", ORDERS.USER_ID, null]],
          },
        },
        { visitQuestion: true },
      );
    });

    it("should work for simple mode", () => {
      openSummarizeOptions("Simple mode");

      changeBinningForDimension({
        name: "Average of Subtotal",
        fromBinning: "Auto bin",
        toBinning: "10 bins",
      });

      cy.get(".bar");
    });

    it("should work for notebook mode", () => {
      openSummarizeOptions("Notebook mode");

      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();

      changeBinningForDimension({
        name: "Average of Subtotal",
        fromBinning: "Auto bin",
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

      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("SQL Binning").click();

      visualize();
      summarize();
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
  startNewQuestion();
  cy.findByText("Saved Questions").click();
  cy.findByText("16379").click();

  if (questionType === "Simple mode") {
    visualize();
    summarize();
  }
}
