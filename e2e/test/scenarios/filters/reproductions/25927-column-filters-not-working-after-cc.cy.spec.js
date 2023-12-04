import { popover, restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const query = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      expressions: {
        "Custom Count": ["field", "count", { "base-type": "type/Integer" }],
      },
    },
    type: "query",
  },
  display: "table",
};

describe("issue 25927", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitQuestionAdhoc(query);
  });

  it("column filter should work for questions with custom column (metabase#25927)", () => {
    cy.findAllByTestId("header-cell").contains("Created At: Month").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Last 30 Days").click();
    });

    cy.wait("@dataset");

    // Click on the filter again to try updating it
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is in the previous 30 days")
      .click();

    popover().button("Update filter").should("not.be.disabled");
  });
});
