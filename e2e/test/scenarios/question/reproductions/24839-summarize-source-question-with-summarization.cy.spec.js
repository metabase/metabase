import { restore, visitQuestionAdhoc, popover } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "24839",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["sum", ["field", ORDERS.QUANTITY, null]],
      ["avg", ["field", ORDERS.TOTAL, null]],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  display: "line",
};

describe("issue 24839: should be able to summarize a nested question based on the source question with aggregations (metabase#24839)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      // Start ad-hoc nested question based on the saved one
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${id}` },
          type: "query",
        },
      });
    });
  });

  it.skip("from the notebook GUI (metabase#24839-1)", () => {
    cy.icon("notebook").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();
    popover()
      .should("contain", "Sum of Quantity")
      .and("contain", "Average of Total");
  });

  it("from a table header cell (metabase#24839-2)", () => {
    cy.findAllByTestId("header-cell").contains("Average of Total").click();

    popover().contains("Distinct values").click();

    cy.get(".ScalarValue").invoke("text").should("eq", "49");

    cy.findByTestId("aggregation-item")
      .invoke("text")
      .should("eq", "Distinct values of Average of Total");
  });
});
