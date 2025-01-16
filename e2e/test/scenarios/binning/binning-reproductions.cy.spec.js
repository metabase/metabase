import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("binning related reproductions", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("shouldn't render double binning options when question is based on the saved native question (metabase#16327)", () => {
    cy.createNativeQuestion({
      name: "16327",
      native: { query: "select * from products limit 5" },
    });

    cy.startNewQuestion();
    cy.entityPickerModal().within(() => {
      cy.entityPickerModalTab("Collections").click();
      cy.findByText("16327").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a function or metric").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/CREATED_AT/i).realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("by month").click({ force: true });

    // Implicit assertion - it fails if there is more than one instance of the string, which is exactly what we need for this repro
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Day");
  });

  it("should be able to update the bucket size / granularity on a field that has sorting applied to it (metabase#16770)", () => {
    cy.visitQuestionAdhoc({
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

    cy.summarize();

    cy.changeBinningForDimension({
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Year",
      isSelected: true,
    });

    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count by Created At: Year");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2024");
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

    cy.startNewQuestion();
    cy.entityPickerModal().within(() => {
      cy.entityPickerModalTab("Collections").click();
      cy.findByText("17975").click();
    });

    cy.getNotebookStep("summarize")
      .findByText("Pick a function or metric")
      .click();
    cy.popover().findByText("Count of rows").click();
    cy.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    cy.popover().findByText("CREATED_AT").click();

    cy.findByRole("button", { name: "Sort" }).click();
    cy.popover().findByText("CREATED_AT: Month").click();

    cy.getNotebookStep("summarize").findByText("CREATED_AT: Month").click();
    cy.popover()
      .findByRole("option", { name: "CREATED_AT" })
      .findByLabelText("Temporal bucket")
      .click();
    cy.popover().last().findByText("Quarter").click();

    cy.getNotebookStep("sort").findByText("CREATED_AT: Quarter");
  });

  it("should render binning options when joining on the saved native question (metabase#18646)", () => {
    cy.createNativeQuestion(
      {
        name: "18646",
        native: { query: "select * from products" },
      },
      { loadMetadata: true },
    );

    cy.openOrdersTable({ mode: "notebook" });

    cy.icon("join_left_outer").click();

    cy.entityPickerModal().within(() => {
      cy.entityPickerModalTab("Collections").click();
      cy.findByText("18646").click();
    });

    cy.popover().findByText("Product ID").click();

    cy.popover().within(() => {
      cy.findByText("ID").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    cy.popover().findByText("Count of rows").click();

    cy.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    cy.popover().findByText("18646").click();

    cy.popover().within(() => {
      cy.findByRole("option", { name: /CREATED_AT/ })
        .findByText("by month")
        .should("exist");
      cy.findByRole("option", { name: /CREATED_AT/ }).click({
        position: "left",
      });
    });

    cy.getNotebookStep("summarize").findByText(
      "18646 - Product → Created At: Month",
    );

    cy.visualize();
    cy.cartesianChartCircle();
  });

  it("should display date granularity on Summarize when opened from saved question (metabase#10441, metabase#11439)", () => {
    cy.createQuestion({
      name: "11439",
      query: { "source-table": ORDERS_ID },
    });

    // it is essential for this repro to find question following these exact steps
    // (for example, visiting `/collection/root` would yield different result)
    cy.startNewQuestion();
    cy.entityPickerModal().within(() => {
      cy.entityPickerModalTab("Collections").click();
      cy.findByText("11439").click();
    });

    cy.visualize();
    cy.summarize();

    cy.rightSidebar().within(() => {
      cy.findAllByRole("listitem", { name: "Created At" })
        .eq(0)
        .findByLabelText("Temporal bucket")
        .click();
    });

    cy.popover().within(() => {
      cy.button("More…").click();
      cy.findByText("Hour of day").should("exist");
    });
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

    cy.openVizSettingsSidebar();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("draggable-item-Created At: Month")
        .findByText("Created At: Month")
        .should("be.visible");
      cy.findByTestId("draggable-item-Created At: Month")
        .icon("eye_outline")
        .click({ force: true });
    });
    cy.closeVizSettingsSidebar();

    cy.summarize();

    cy.findByTestId("pinned-dimensions")
      .should("contain", "Created At")
      .find(".Icon-close")
      .click();
    cy.wait("@dataset");

    cy.findByTestId("query-visualization-root").findByText("Count");

    cy.findByTestId("sidebar-right")
      .findAllByText("Created At")
      .first()
      .click();
    cy.wait("@dataset");

    cy.findByTestId("query-visualization-root").within(() => {
      // All of these are implicit assertions and will fail if there's more than one string
      cy.findByText("Count");
      cy.findByText("Created At: Month");
      cy.findByText("June 2022");
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

      cy.changeBinningForDimension({
        name: "Average of Subtotal",
        fromBinning: "Auto bin",
        toBinning: "10 bins",
      });

      cy.chartPathWithFillColor("#509EE3");
    });

    it("should work for notebook mode", () => {
      openSummarizeOptions("Notebook mode");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a function or metric").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();

      cy.changeBinningForDimension({
        name: "Average of Subtotal",
        fromBinning: "Auto bin",
        toBinning: "10 bins",
      });

      cy.visualize();

      cy.chartPathWithFillColor("#509EE3");
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

      cy.startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved Questions").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("SQL Binning").click();

      cy.visualize();
      cy.summarize();
    });

    it("should render number auto binning correctly (metabase#16670)", () => {
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("TOTAL").click();
      });

      cy.wait("@dataset");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count by TOTAL: Auto binned");
      cy.get(".bar").should("have.length.of.at.most", 10);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("-60");
    });

    it("should render time series auto binning default bucket correctly (metabase#16671)", () => {
      cy.getBinningButtonForDimension({ name: "CREATED_AT" }).should(
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count by LONGITUDE: Auto binned");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("170° W");
    });
  });
});

function openSummarizeOptions(questionType) {
  cy.startNewQuestion();
  cy.entityPickerModal().within(() => {
    cy.entityPickerModalTab("Collections").click();
    cy.findByText("16379").click();
  });

  if (questionType === "Simple mode") {
    cy.visualize();
    cy.summarize();
  }
}
