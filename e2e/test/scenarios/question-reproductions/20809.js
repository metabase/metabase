import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visualize,
  enterCustomColumnDetails,
  visitQuestionAdhoc,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 20809", () => {
  const questionDetails = {
    name: "20809",
    query: {
      "source-table": REVIEWS_ID,
      filter: [
        "=",
        ["field", PRODUCTS.CATEGORY, { "source-field": REVIEWS.PRODUCT_ID }],
        "Doohickey",
      ],
      aggregation: [["count"]],
      breakout: [["field", REVIEWS.PRODUCT_ID, null]],
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      const nestedQuestion = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                "source-table": `card__${id}`,
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  [
                    "field",
                    REVIEWS.PRODUCT_ID,
                    { "join-alias": `Question ${id}` },
                  ],
                ],
                alias: `Question ${id}`,
              },
            ],
          },
          type: "query",
        },
      };

      visitQuestionAdhoc(nestedQuestion, { mode: "notebook" });
    });
  });

  it("nesting should work on a saved question with a filter to implicit/explicit table (metabase#20809)", () => {
    cy.findByTextEnsureVisible("Custom column").click();

    enterCustomColumnDetails({
      formula: "1 + 1",
      name: "Two",
    });

    cy.button("Done").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});
