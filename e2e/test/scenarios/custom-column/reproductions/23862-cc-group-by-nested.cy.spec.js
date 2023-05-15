import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "23862",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      CC: [
        "case",
        [[[">", ["field", ORDERS.TOTAL, null], 10], "Large"]],
        {
          default: "Small",
        },
      ],
    },
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [["expression", "CC"]],
  },
};

describe("issue 23862", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should group by a custom column and work in a nested question (metabase#23862)", () => {
    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      visitQuestionAdhoc(
        {
          dataset_query: {
            type: "query",
            query: {
              "source-table": `card__${id}`,
            },
            database: SAMPLE_DB_ID,
          },
          display: "table",
        },
        {
          callback: xhr => expect(xhr.response.body.error).not.to.exist,
        },
      );
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Small");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("-36.53");
  });
});
