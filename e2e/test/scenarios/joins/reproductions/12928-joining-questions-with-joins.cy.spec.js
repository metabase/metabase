import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertJoinValid,
  assertQueryBuilderRowCount,
  popover,
  restore,
  selectSavedQuestionsToJoin,
  startNewQuestion,
  visualize,
} from "e2e/support/helpers";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

const SOURCE_QUESTION_NAME = "12928_Q1";
const JOINED_QUESTION_NAME = "12928_Q2";

const SOURCE_QUESTION_DETAILS = {
  name: SOURCE_QUESTION_NAME,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
      ["field", PEOPLE.SOURCE, { "join-alias": "People - User" }],
    ],
    joins: [
      {
        alias: "Products",
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        fields: "all",
        "source-table": PRODUCTS_ID,
      },
      {
        alias: "People - User",
        condition: [
          "=",
          ["field", ORDERS.USER_ID, null],
          ["field", PEOPLE.ID, { "join-alias": "People - User" }],
        ],
        fields: "all",
        "source-table": PEOPLE_ID,
      },
    ],
  },
};

const JOINED_QUESTION_DETAILS = {
  name: JOINED_QUESTION_NAME,
  query: {
    "source-table": REVIEWS_ID,
    aggregation: [["avg", ["field", REVIEWS.RATING, null]]],
    breakout: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
    joins: [
      {
        alias: "Products",
        condition: [
          "=",
          ["field", REVIEWS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        fields: "all",
        "source-table": PRODUCTS_ID,
      },
    ],
  },
};

describe("issue 12928", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should join saved questions that themselves contain joins (metabase#12928)", () => {
    cy.createQuestion(SOURCE_QUESTION_DETAILS);
    cy.createQuestion(JOINED_QUESTION_DETAILS, {
      wrapId: true,
      idAlias: "joinedQuestionId",
    });

    startNewQuestion();
    selectSavedQuestionsToJoin(SOURCE_QUESTION_NAME, JOINED_QUESTION_NAME);
    popover().findByText("Products → Category").click();
    popover().findByText("Products → Category").click();

    visualize();

    cy.get("@joinedQuestionId").then(joinedQuestionId => {
      assertJoinValid({
        lhsTable: SOURCE_QUESTION_NAME,
        rhsTable: JOINED_QUESTION_NAME,
        lhsSampleColumn: "Products → Category",
        rhsSampleColumn: `${JOINED_QUESTION_NAME} - Products → Category → Category`,
      });
    });

    assertQueryBuilderRowCount(20);
  });
});
