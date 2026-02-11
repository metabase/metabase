const { H } = cy;
import { dedent } from "ts-dedent";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > summarize sidebar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    H.visitQuestion(ORDERS_QUESTION_ID);
    H.summarize();
  });

  it("removing all aggregations should show add aggregation button with label", () => {
    cy.findByTestId("aggregation-item").within(() => {
      cy.icon("close").click();
    });

    cy.findByTestId("add-aggregation-button").should(
      "have.text",
      "Add a function or metric",
    );
  });

  it("selected dimensions becomes pinned to the top of the dimensions list", () => {
    H.getDimensionByName({ name: "Total" })
      .should("have.attr", "aria-selected", "false")
      .click({ position: "left" });

    H.getDimensionByName({ name: "Total" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );

    cy.button("Done").click();

    H.summarize();

    // Removed from the unpinned list
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total").should("not.exist");
    });

    // Displayed in the pinned list
    cy.findByTestId("pinned-dimensions").within(() => {
      cy.findByText("Orders → Total").should("not.exist");
      H.getDimensionByName({ name: "Total" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    H.getRemoveDimensionButton({ name: "Total" }).click();

    // Becomes visible in the unpinned list again
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total");
    });
  });

  it("selected dimensions from another table includes the table alias when becomes pinned to the top", () => {
    H.getDimensionByName({ name: "State" }).click();

    cy.button("Done").click();

    H.summarize();

    cy.findByTestId("pinned-dimensions").within(() => {
      H.getDimensionByName({ name: "User → State" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    H.getRemoveDimensionButton({ name: "User → State" }).click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → State").should("not.exist");
  });

  it("selecting a binning adds a dimension", () => {
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
    H.getDimensionByName({ name: "Discount" }).within(() => {
      cy.button("Add dimension").realHover();
      cy.findByLabelText("Binning strategy").should("be.visible");
    });
  });

  it("should be able to do subsequent aggregation on a custom expression (metabase#14649)", () => {
    H.createQuestion(
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("49.54");
  });

  it("should allow using `Custom Expression` in orders metrics (metabase#12899)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().contains("Custom Expression").click();

    H.enterCustomColumnDetails({
      formula: "2 * Max([Total])",
      name: "twice max total",
    });

    H.expressionEditorWidget().button("Done").click();
    cy.findByTestId("aggregate-step")
      .contains("twice max total")
      .should("exist");

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("318.7");
  });

  it("should keep manually entered parenthesis intact if they affect the result (metabase#13306)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });

    H.popover().contains("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: "sum([Total]) / (sum([Product → Price]) * average([Quantity]))",
      format: true,
    });

    H.CustomExpressionEditor.value().should(
      "equal",
      dedent`
        Sum([Total]) /
          (Sum([Product → Price]) * Average([Quantity]))
      `.trim(),
    );
  });

  it("distinct inside custom expression should suggest non-numeric types (metabase#13469)", () => {
    H.openReviewsTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().contains("Custom Expression").click();

    H.enterCustomColumnDetails({ formula: "Distinct([R", blur: false });

    cy.log(
      "**The point of failure for ANY non-numeric value reported in v0.36.4**",
    );
    // the default type for "Reviewer" is "No semantic type"
    H.CustomExpressionEditor.completion("Reviewer").should("be.visible");
  });

  it("summarizing by distinct datetime should allow granular selection (metabase#13098)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.summarize({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Number of distinct values of ...").click();
      cy.findByLabelText("Temporal bucket").realHover().click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover()
      .last()
      .within(() => {
        cy.button("More…").click();
        cy.findByText("Hour of day").click();
      });
  });

  it("should handle (removing) multiple metrics when one is sorted (metabase#12625)", () => {
    H.createTestQuery({
      database: SAMPLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            { type: "operator", operator: "count", args: [] },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "SUBTOTAL" }],
            },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "TOTAL" }],
            },
          ],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              sourceName: "ORDERS",
              unit: "year",
            },
          ],
          orderBys: [
            {
              direction: "desc",
              type: "column",
              name: "sum",
              displayName: "Sum of Subtotal",
            },
          ],
        },
      ],
    })
      .then((dataset_query) => H.createCard({ name: "12625", dataset_query }))
      .then((card) => H.visitQuestion(card.id));

    H.summarize();

    cy.findAllByTestId("header-cell").should("have.length", 4);
    H.tableHeaderColumn("Sum of Subtotal")
      .closest("[data-testid=header-cell]")
      .findByLabelText("chevrondown icon");

    cy.log('At this point only "Sum of Subtotal" should be sorted');
    H.tableInteractiveHeader("header-sort-indicator")
      .findAllByTestId("header-sort-indicator")
      .should("have.length", 1);

    cy.log("Remove the sorted metric");
    removeMetricFromSidebar("Sum of Subtotal");

    cy.log('"Sum of Total" should not be sorted, nor any other header cell');
    H.tableInteractiveHeader("header-sort-indicator")
      .findAllByTestId("header-sort-indicator")
      .should("have.length", 0);

    cy.findAllByTestId("header-cell")
      .should("have.length", 3)
      .and("not.contain", "Sum of Subtotal");

    removeMetricFromSidebar("Sum of Total");

    cy.findAllByTestId("header-cell").should("have.length", 2);
    cy.get("[data-testid=cell-data]").should("contain", 744); // `Count` for year 2022
  });

  // flaky test (#19454)
  it(
    "should show an info popover when hovering over summarize dimension options",
    { tags: "@skip" },
    () => {
      H.openReviewsTable();

      H.summarize();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Group by")
        .parent()
        .findByText("Title")
        .trigger("mouseenter");

      H.popover().contains("Title");
      H.popover().contains("199 distinct values");
    },
  );
});

function removeMetricFromSidebar(metricName) {
  H.interceptIfNotPreviouslyDefined({
    method: "POST",
    url: "/api/dataset",
    alias: "dataset",
  });

  H.rightSidebar().within(() => {
    cy.findByLabelText(metricName)
      .find(".Icon-close")
      .should("be.visible")
      .click();
    cy.wait("@dataset");

    cy.findByLabelText(metricName).should("not.exist");
  });
}
