import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  entityPickerModal,
  entityPickerModalTab,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";

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
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findAllByText(collectionName).first().click();

      cy.findByText(questions[ORDERS_QUESTION_ID]).should("exist");
      cy.findByText(questions[ORDERS_COUNT_QUESTION_ID]).should("not.exist");
    });
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
