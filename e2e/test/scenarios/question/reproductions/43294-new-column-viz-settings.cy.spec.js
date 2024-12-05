import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 43294", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not overwrite viz settings with click actions in raw data mode (metabase#43294)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.queryBuilderFooter().findByLabelText("Switch to data").click();

    cy.log("extract action");
    cy.button("Add column").click();
    H.popover().findByText("Extract part of column").click();
    H.popover().within(() => {
      cy.findByText("Created At: Month").click();
      cy.findByText("Year").click();
    });

    cy.log("combine action");
    cy.button("Add column").click();
    H.popover().findByText("Combine columns").click();
    H.popover().findByText("First column").next().click();
    H.popover().last().findByText("Count").click();
    H.popover().findByText("Second column").next().click();
    H.popover().last().findByText("Count").click();
    H.popover().button("Done").click();

    cy.log("check visualization");
    H.queryBuilderFooter().findByLabelText("Switch to visualization").click();
    H.echartsContainer().within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("Created At").should("be.visible");
    });
  });
});
