import { restore, sidebar } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
    sidebar().contains("Count").click();

    cy.findByText("See options…").click();

    cy.findByDisplayValue("Count").type(" renamed").blur();

    cy.wait("@pivotDataset");

    cy.get(".Visualization").should("contain", "Count renamed");
  });
});
