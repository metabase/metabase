import { modal, popover, restore } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const TEST_QUERY = {
  "order-by": [["asc", ["field", "sum", { "base-type": "type/Float" }]]],
  limit: 10,
  filter: ["<", ["field", "sum", { "base-type": "type/Float" }], 100],
  "source-query": {
    "source-table": ORDERS_ID,
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [
      [
        "field",
        PEOPLE.NAME,
        { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
      ],
    ],
  },
};

describe("scenarios > models with aggregation and breakout", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createModel");
  });

  it("should duplicate a model with its original aggregation and breakout", () => {
    cy.createQuestion(
      {
        name: "model",
        query: TEST_QUERY,
        type: "query",
        database: SAMPLE_DB_ID,
        dataset: true,
      },
      {
        visitQuestion: true,
        wrapId: true,
        idAlias: "modelId",
      },
    );

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByLabelText("Move, archive, and more...").click();
    });

    popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    modal().within(() => {
      cy.findByText("Duplicate").click();
    });

    modal().within(() => {
      cy.findByText("Not now").click();
    });

    cy.wait("@createModel").then(({ response: { body } }) => {
      cy.request("GET", `/api/card/${body.id}`).then(
        ({ body: { dataset_query } }) => {
          expect(dataset_query.query).to.deep.eq(TEST_QUERY);
          expect(dataset_query.database).to.eq(SAMPLE_DB_ID);
          expect(dataset_query.type).to.eq("query");
        },
      );
    });

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByLabelText("Move, archive, and more...").click();
    });

    popover().within(() => {
      cy.findByText("Edit query definition").click();
    });

    cy.findByTestId("data-step-cell").within(() => {
      cy.findByText("Orders").should("exist");
    });

    cy.findByTestId("aggregate-step").within(() => {
      cy.findByText("Sum of Total").should("exist");
    });

    cy.findByTestId("breakout-step").within(() => {
      cy.findByText("User → Name").should("exist");
    });

    cy.findByTestId("step-filter-1-0").within(() => {
      cy.findByText("Sum of Total is less than 100").should("exist");
    });

    cy.findByTestId("step-sort-1-0").within(() => {
      cy.findByText("Sum of Total").should("exist");
    });

    cy.findByTestId("step-limit-1-0").within(() => {
      cy.findByDisplayValue("10").should("exist");
    });
  });
});
