import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const Y_AXIS_RIGHT_SELECTOR = ".axis.yr";

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
  },
  database: 1,
};

describe("scenarios > visualizations > line chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
  });

  it("should be able to change y axis position (metabase#13487)", () => {
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    cy.wait("@dataset");
    cy.findByText("Settings").click();
    cy.findByText("Right").click();
    cy.get(Y_AXIS_RIGHT_SELECTOR);
  });
});
