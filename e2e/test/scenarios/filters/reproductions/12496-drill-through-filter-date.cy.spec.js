import { popover, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 12496", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  it("should display correct day range in filter pill when drilling into a week", () => {
    cy.createQuestion(
      {
        name: "Orders by Created At: Week",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        },
        display: "line",
      },
      { visitQuestion: true },
    );
    cy.get(".dot").eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 24–30, 2022")
      .click();
    cy.findByTestId("between-date-picker").within(() => {
      cy.findAllByTestId("specific-date-picker")
        .eq(0)
        .within(() => {
          cy.get("input").should("have.value", "04/24/2022");
        });
      cy.findAllByTestId("specific-date-picker")
        .eq(1)
        .within(() => {
          cy.get("input").should("have.value", "04/30/2022");
        });
    });
  });
  it("should display correct day range in filter pill when drilling into a month", () => {
    cy.createQuestion(
      {
        name: "Orders by Created At: Month",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );
    cy.get(".dot").eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 2022")
      .click();
    cy.findByTestId("between-date-picker").within(() => {
      cy.findAllByTestId("specific-date-picker")
        .eq(0)
        .within(() => {
          cy.get("input").should("have.value", "04/01/2022");
        });
      cy.findAllByTestId("specific-date-picker")
        .eq(1)
        .within(() => {
          cy.get("input").should("have.value", "04/30/2022");
        });
    });
  });
});
