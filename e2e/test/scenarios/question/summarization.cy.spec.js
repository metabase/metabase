import {
  restore,
  changeBinningForDimension,
  getDimensionByName,
  getRemoveDimensionButton,
  summarize,
  visitQuestion,
  popover,
  openReviewsTable,
  openOrdersTable,
  enterCustomColumnDetails,
  visualize,
  checkExpressionEditorHelperPopoverPosition,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > summarize sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    visitQuestion(1);
    summarize();
  });

  it("removing all aggregations should show add aggregation button with label", () => {
    cy.findByTestId("aggregation-item").within(() => {
      cy.icon("close").click();
    });

    cy.findByTestId("add-aggregation-button").should(
      "have.text",
      "Add a metric",
    );
  });

  it("selected dimensions becomes pinned to the top of the dimensions list", () => {
    getDimensionByName({ name: "Total" })
      .should("have.attr", "aria-selected", "false")
      .click()
      .should("have.attr", "aria-selected", "true");

    cy.button("Done").click();

    summarize();

    // Removed from the unpinned list
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total").should("not.exist");
    });

    // Displayed in the pinned list
    cy.findByTestId("pinned-dimensions").within(() => {
      cy.findByText("Orders → Total").should("not.exist");
      getDimensionByName({ name: "Total" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    getRemoveDimensionButton({ name: "Total" }).click();

    // Becomes visible in the unpinned list again
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total");
    });
  });

  it("selected dimensions from another table includes the table alias when becomes pinned to the top", () => {
    getDimensionByName({ name: "State" }).click();

    cy.button("Done").click();

    summarize();

    cy.findByTestId("pinned-dimensions").within(() => {
      getDimensionByName({ name: "User → State" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    getRemoveDimensionButton({ name: "User → State" }).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → State").should("not.exist");
  });

  it("selecting a binning adds a dimension", () => {
    getDimensionByName({ name: "Total" }).click();

    changeBinningForDimension({
      name: "Quantity",
      toBinning: "10 bins",
    });

    getDimensionByName({ name: "Total" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
    getDimensionByName({ name: "Quantity" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
  });

  it("should be able to do subsequent aggregation on a custom expression (metabase#14649)", () => {
    cy.createQuestion(
      {
        name: "14649_min",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                ["sum", ["field", ORDERS.SUBTOTAL, null]],
                { name: "Revenue", "display-name": "Revenue" },
              ],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          aggregation: [
            ["min", ["field", "Revenue", { "base-type": "type/Float" }]],
          ],
        },

        display: "scalar",
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("49.54");
  });

  it("breakout binning popover should have normal height even when it's rendered lower on the screen (metabase#15445)", () => {
    cy.visit("/question/1/notebook");
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At")
      .closest(".List-item")
      .findByText("by month")
      .click({ force: true });
    // First a reality check - "Minute" is the only string visible in UI and this should pass
    cy.findAllByText("Minute")
      .first() // TODO: cy.findAllByText(string).first() is necessary workaround that will be needed ONLY until (metabase#15570) gets fixed
      .isVisibleInPopover();
    // The actual check that will fail until this issue gets fixed
    cy.findAllByText("Week").first().isVisibleInPopover();
  });

  it("should allow using `Custom Expression` in orders metrics (metabase#12899)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    popover().contains("Custom Expression").click();
    popover().within(() => {
      enterCustomColumnDetails({ formula: "2 * Max([Total])" });
      cy.findByPlaceholderText("Something nice and descriptive").type(
        "twice max total",
      );
      cy.findByText("Done").click();
    });

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("318.7");
  });

  it("should keep manually entered parenthesis intact if they affect the result (metabase#13306)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });

    popover().contains("Custom Expression").click();
    popover().within(() => {
      enterCustomColumnDetails({
        formula:
          "sum([Total]) / (sum([Product → Price]) * average([Quantity]))",
      });
      cy.get("@formula").blur();
    });

    popover().within(() => {
      cy.get(".ace_text-layer").should(
        "have.text",
        "Sum([Total]) / (Sum([Product → Price]) * Average([Quantity]))",
      );
    });
  });

  it("distinct inside custom expression should suggest non-numeric types (metabase#13469)", () => {
    openReviewsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    popover().contains("Custom Expression").click();

    enterCustomColumnDetails({ formula: "Distinct([R" });

    cy.log(
      "**The point of failure for ANY non-numeric value reported in v0.36.4**",
    );
    // the default type for "Reviewer" is "No semantic type"
    cy.findByTestId("expression-suggestions-list").within(() => {
      cy.contains("Reviewer");
    });
  });

  it("summarizing by distinct datetime should allow granular selection (metabase#13098)", () => {
    // Go straight to orders table in custom questions
    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Number of distinct values of ...").click();
      cy.log(
        "**Test fails at this point as there isn't an extra field next to 'Created At'**",
      );
      // instead of relying on DOM structure that might change
      // (i.e. find "Created At" -> parent -> parent -> parent -> find "by month")
      // access it directly from the known common parent
      cy.get(".List-item").contains("by month").click({ force: true });
    });
    // this should be among the granular selection choices
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Hour of day").click();
  });

  it.skip("should handle (removing) multiple metrics when one is sorted (metabase#12625)", () => {
    cy.intercept("POST", `/api/dataset`).as("dataset");

    cy.createQuestion(
      {
        name: "12625",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.SUBTOTAL, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
          "order-by": [["desc", ["aggregation", 1]]],
        },
      },
      { visitQuestion: true },
    );

    summarize();

    // CSS class of a sorted header cell
    cy.get("[class*=TableInteractive-headerCellData--sorted]").as("sortedCell");

    // At this point only "Sum of Subtotal" should be sorted
    cy.get("@sortedCell").its("length").should("eq", 1);
    removeMetricFromSidebar("Sum of Subtotal");

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of Subtotal").should("not.exist");

    // "Sum of Total" should not be sorted, nor any other header cell
    cy.get("@sortedCell").its("length").should("eq", 0);

    removeMetricFromSidebar("Sum of Total");

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/No results!/i).should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("744"); // `Count` for year 2016
  });

  // flaky test (#19454)
  it.skip("should show an info popover when hovering over summarize dimension options", () => {
    openReviewsTable();

    summarize();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by")
      .parent()
      .findByText("Title")
      .trigger("mouseenter");

    popover().contains("Title");
    popover().contains("199 distinct values");
  });

  it("should render custom expression helper near the custom expression field", async () => {
    openReviewsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Custom Expression").click();

      enterCustomColumnDetails({ formula: "floor" });

      checkExpressionEditorHelperPopoverPosition();
    });
  });
});

function removeMetricFromSidebar(metricName) {
  cy.get("[class*=SummarizeSidebar__AggregationToken]")
    .contains(metricName)
    .parent()
    .find(".Icon-close")
    .should("be.visible")
    .click();
}
