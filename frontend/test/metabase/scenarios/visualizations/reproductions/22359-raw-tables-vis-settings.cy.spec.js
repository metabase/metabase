import { popover, restore, visitQuestionAdhoc } from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "21973",
  display: "line",
  dataset_query: {
    type: "query",
    database: 1,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  },
  visualization_settings: {
    "graph.metrics": ["count"],
    "graph.dimensions": ["CREATED_AT"],
  },
};

describe("issue 22359", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should use visualization settings when viewing raw table data (metabase#22359)", () => {
    visitQuestionAdhoc(questionDetails);
    cy.icon("table2").click();
    cy.findByText("Settings").click();

    cy.findByTestId("sidebar-left").within(() => {
      cy.findByText("Data").click();
      cy.findByText("X-axis")
        .parent()
        .within(() => cy.icon("gear").click());
      cy.findByText("January, 2018").click();
    });

    popover().within(() => cy.findByText("1/2018").click());
    cy.findByText("4/2016").should("be.visible");
  });
});
