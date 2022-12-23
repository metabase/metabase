import {
  restore,
  visitQuestionAdhoc,
  popover,
  visualize,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

describe.skip("issue 25994", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
    cy.icon("notebook").click();
  });

  it("should be possible to use 'between' dates filter after aggregation (metabase#25994)", () => {
    cy.findByText("Filter").click();
    popover().findByText("Min of Created At: Day").click();
    cy.findByText("Specific dates...").click();

    // It doesn't really matter which dates we select so let's go with whatever is offered
    cy.button("Add filter").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });
});
