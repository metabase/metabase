import { popover, restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-query": {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PRODUCTS.CATEGORY, null],
        ],
      },
      aggregation: [["count"]],
      breakout: [["field", "CATEGORY", { "base-type": "type/Text" }]],
    },
  },
  visualization_settings: {
    "table.pivot_column": "CATEGORY",
    "table.cell_column": "count",
  },
};

describe("issue 25016", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be possible to filter by a column in a multi-stage query (metabase#25016)", () => {
    visitQuestionAdhoc(questionDetails);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row").should("be.visible");
  });
});
