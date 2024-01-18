import {
  restore,
  visitQuestionAdhoc,
  popover,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    type: "query",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [
        ["min", ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "day" }]],
      ],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    database: SAMPLE_DB_ID,
  },
};

describe("issue 25994", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be possible to use 'between' dates filter after aggregation (metabase#25994)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("Min of Created At: Day").click();
      cy.findByText("Specific dates…").click();

      // It doesn't really matter which dates we select so let's go with whatever is offered
      cy.button("Add filter").click();
    });

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });
});
