import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
const { ORDERS_ID } = SAMPLE_DATABASE;

const LONG_NAME = "A very long column name that will cause text overflow";

const QUESTION = {
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        [LONG_NAME]: ["*", ["field", SAMPLE_DATABASE.ORDERS.SUBTOTAL, null], 2],
      },
      aggregation: [["sum", ["expression", LONG_NAME]]],
      breakout: [
        [
          "field",
          SAMPLE_DATABASE.ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "week",
          },
        ],
      ],
    },
  },
};

describe("issue 32964", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not overflow chart settings sidebar with long column name (metabase#32964)", () => {
    visitQuestionAdhoc(QUESTION);
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(([sidebar]) => {
      const maxX = sidebar.getBoundingClientRect().right;
      cy.findByText(`Sum of ${LONG_NAME}`).then(([el]) => {
        const x = el.getBoundingClientRect().right;
        expect(x).to.be.lessThan(maxX);
      });
    });
  });
});
