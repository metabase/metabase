import { restore, sidebar } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "15353",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "pivot",
};

describe("issue 15353", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should be able to change field name used for values (metabase#15353)", () => {
    cy.findByTestId("viz-settings-button").click();
    sidebar()
      .contains("Count")
      .siblings("[data-testid$=settings-button]")
      .click();

    cy.findByDisplayValue("Count").type(" renamed").blur();

    cy.wait("@pivotDataset");

    cy.get(".Visualization").should("contain", "Count renamed");
  });
});
