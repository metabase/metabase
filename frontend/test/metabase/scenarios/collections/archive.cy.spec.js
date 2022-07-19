import { getCollectionIdFromSlug, restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE_ID } = SAMPLE_DATABASE;

const getQuestionDetails = collectionId => ({
  name: "A question",
  query: { "source-table": PEOPLE_ID },
  collection_id: collectionId,
});

describe("scenarios > collections > archive", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shows correct page when visiting page of question that was in archived collection (metabase##23501)", () => {
    getCollectionIdFromSlug("first_collection", collectionId => {
      const questionDetails = getQuestionDetails(collectionId);

      cy.createQuestion(questionDetails).then(
        ({ body: { id: questionId } }) => {
          cy.request("PUT", `/api/collection/${collectionId}`, {
            archived: true,
          });

          // Question belonging to collection
          // will have been archived,
          // and archived page should be displayed
          cy.visit(`/question/${questionId}`);
          cy.findByText("This question has been archived");
        },
      );
    });
  });
});
