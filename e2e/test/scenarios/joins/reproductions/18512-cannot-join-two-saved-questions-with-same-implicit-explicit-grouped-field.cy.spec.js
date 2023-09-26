import {
  restore,
  popover,
  visualize,
  startNewQuestion,
  selectSavedQuestionsToJoin,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const question1 = getQuestionDetails("18512#1", "Doohickey");
const question2 = getQuestionDetails("18512#2", "Gizmo");

describe("issue 18512", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should join two saved questions with the same implicit/explicit grouped field (metabase#18512)", () => {
    cy.createQuestion(question1);
    cy.createQuestion(question2);

    startNewQuestion();
    selectSavedQuestionsToJoin("18512#1", "18512#2");

    popover().findByText("Products → Created At").click();
    popover().findByText("Products → Created At").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products → Created At");
  });
});

function getQuestionDetails(name, catFilter) {
  return {
    name,
    query: {
      "source-table": REVIEWS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", REVIEWS.PRODUCT_ID, null],
            ["field", PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
      filter: [
        "=",
        ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
        catFilter,
      ],
      aggregation: [
        ["distinct", ["field", PRODUCTS.ID, { "join-alias": "Products" }]],
      ],
      breakout: [
        [
          "field",
          PRODUCTS.CREATED_AT,
          { "join-alias": "Products", "temporal-unit": "month" },
        ],
      ],
    },
  };
}
