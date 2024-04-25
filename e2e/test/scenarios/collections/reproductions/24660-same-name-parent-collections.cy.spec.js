import {
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { restore, startNewQuestion } from "e2e/support/helpers";

const collectionName = "Parent";

const questions = {
  [ORDERS_QUESTION_ID]: "Orders",
  [ORDERS_COUNT_QUESTION_ID]: "Orders, Count",
};

describe("issue 24660", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createParentCollectionAndMoveQuestionToIt(ORDERS_QUESTION_ID);
    createParentCollectionAndMoveQuestionToIt(ORDERS_COUNT_QUESTION_ID);
  });

  it("should properly show contents of different collections with the same name (metabase#24660)", () => {
    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Saved Questions").click();
    cy.findAllByTestId("tree-item-name")
      .contains(collectionName)
      .first()
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questions[ORDERS_QUESTION_ID]);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questions[ORDERS_COUNT_QUESTION_ID]).should("not.exist");
  });
});

function createParentCollectionAndMoveQuestionToIt(questionId) {
  return cy
    .createCollection({
      name: collectionName,
      parent_id: null,
    })
    .then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${questionId}`, {
        collection_id: id,
      });
    });
}
