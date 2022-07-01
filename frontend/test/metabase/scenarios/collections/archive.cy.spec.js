import {
  getCollectionIdFromSlug,
  restore,
  visitArchivedQuestion,
} from "__support__/e2e/helpers";
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

  it("shows correct page when visiting page of question that was in archived collection", () => {
    getCollectionIdFromSlug("first_collection", collectionId => {
      const questionDetails = getQuestionDetails(collectionId);

      cy.createQuestion(questionDetails).then(({ body: { id } }) => {
        cy.request("PUT", `/api/collection/${collectionId}`, {
          archived: false,
        });
        visitArchivedQuestion(id);
      });
    });
  });
});
