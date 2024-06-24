import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  echartsContainer,
  popover,
  queryBuilderFooter,
  restore,
} from "e2e/support/helpers";

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
    restore();
    cy.signInAsNormalUser();
  });

  it("should not overwrite viz settings with click actions in raw data mode (metabase#43294)", () => {
    createQuestion(questionDetails, { visitQuestion: true });
    queryBuilderFooter().findByLabelText("Switch to data").click();

    cy.log("extract action");
    cy.button("Add column").click();
    popover().findByText("Extract part of column").click();
    popover().within(() => {
      cy.findByText("Created At: Month").click();
      cy.findByText("Year").click();
    });

    cy.log("combine action");
    cy.button("Add column").click();
    popover().findByText("Combine columns").click();
    popover().findByText("First column").next().click();
    popover().last().findByText("Count").click();
    popover().findByText("Second column").next().click();
    popover().last().findByText("Count").click();
    popover().button("Done").click();

    cy.log("check visualization");
    queryBuilderFooter().findByLabelText("Switch to visualization").click();
    echartsContainer().within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("Created At").should("be.visible");
    });
  });
});
