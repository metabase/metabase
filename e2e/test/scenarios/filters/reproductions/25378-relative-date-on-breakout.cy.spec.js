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
    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be able to use relative date filter on a breakout after the aggregation (metabase#25378)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("Created At: Month").click();
      cy.findByText("Relative dates…").click();
      cy.findByDisplayValue("days").click();
    });
    cy.findByRole("listbox").findByText("months").click();
    popover().findByLabelText("Options").click();
    popover().last().findByText("Starting from…").click();

    popover().button("Add filter").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });
});
