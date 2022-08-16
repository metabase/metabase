import {
  restore,
  changeBinningForDimension,
  getDimensionByName,
  getRemoveDimensionButton,
  summarize,
  visitQuestion,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

  it("selected dimensions from another table includes the table name when becomes pinned to the top", () => {
    getDimensionByName({ name: "State" }).click();

    cy.button("Done").click();

    summarize();

    cy.findByTestId("pinned-dimensions").within(() => {
      getDimensionByName({ name: "People → State" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    getRemoveDimensionButton({ name: "People → State" }).click();

    cy.findByText("People → State").should("not.exist");
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

    cy.findByText("49.54");
  });

  it("breakout binning popover should have normal height even when it's rendered lower on the screen (metabase#15445)", () => {
    cy.visit("/question/1/notebook");
    summarize({ mode: "notebook" });
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
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
});
