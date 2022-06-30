import { restore, visitArchivedQuestion } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE_ID } = SAMPLE_DATABASE;

const FIRST_COLLECTION_ID = 9;

const questionDetails = {
  name: "A question",
  query: { "source-table": PEOPLE_ID },
  collection_id: FIRST_COLLECTION_ID,
};

describe("scenarios > collections > archive", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shows correct page when visiting page of question that was in archived collection", () => {
    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.request("PUT", `/api/collection/${FIRST_COLLECTION_ID}`, {
        archived: true,
      });
      visitArchivedQuestion(id);
    });
  });
});
