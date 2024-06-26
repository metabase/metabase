import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, visitQuestionAdhoc } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 43077", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not fire an invalid API request when clicking a legend item on a cartesian chart with multiple aggregations", () => {
    const cartesianQuestionDetails = {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: 1,
      },
      display: "line",
    };
    const cardRequestSpy = cy.spy();
    cy.intercept("/api/card/*", cardRequestSpy);

    visitQuestionAdhoc(cartesianQuestionDetails);

    cy.findAllByTestId("legend-item").first().click();

    cy.wait(100).then(() => expect(cardRequestSpy).not.to.have.been.called);
  });

  it("should not fire an invalid API request when clicking a legend item on a row chart with multiple aggregations", () => {
    const rowQuestionDetails = {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: 1,
      },
      display: "row",
    };
    const cardRequestSpy = cy.spy();
    cy.intercept("/api/card/*", cardRequestSpy);

    visitQuestionAdhoc(rowQuestionDetails);

    cy.findAllByTestId("legend-item").first().click();

    cy.wait(100).then(() => expect(cardRequestSpy).not.to.have.been.called);
  });
});
