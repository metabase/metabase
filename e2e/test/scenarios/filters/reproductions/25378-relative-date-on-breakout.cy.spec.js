import {
  restore,
  visitQuestionAdhoc,
  popover,
  visualize,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "25378",
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    database: SAMPLE_DB_ID,
  },
  display: "line",
};

describe("issue 25378", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("should be able to use relative date filter on a breakout after the aggregation (metabase#25378)", () => {
    cy.icon("notebook").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    popover().contains("Created At").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Relative dates/).click();
    // Change `days` to `months`
    cy.findAllByTestId("select-button-content").contains("days").click();
    popover().last().contains("months").click();
    // Add "Starting from..." but it doesn't matter how many months ago we select
    popover().within(() => {
      cy.icon("ellipsis").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Starting from/).click();

    cy.button("Add filter").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });
});
