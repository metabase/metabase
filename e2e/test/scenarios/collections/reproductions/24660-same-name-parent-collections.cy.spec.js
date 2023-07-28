import { restore, startNewQuestion } from "e2e/support/helpers";

const collectionName = "Parent";

const questions = {
  1: "Orders",
  2: "Orders, Count",
};

describe("issue 24660", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createParentCollectionAndMoveQuestionToIt(1);
    createParentCollectionAndMoveQuestionToIt(2);
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
    cy.findByText(questions[1]);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questions[2]).should("not.exist");
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
