import { getCollectionIdFromSlug, restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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

  it("should load initially hidden archived items on scroll (metabase#24213)", () => {
    const stubbedItems = Array.from({ length: 50 }, (v, i) => ({
      name: "Item " + i,
      id: i + 1,
      model: "card",
    }));

    cy.intercept("GET", "/api/search?archived=true", req => {
      req.reply({
        statusCode: 200,
        body: {
          data: stubbedItems,
        },
      });
    });

    cy.visit("/archive");

    cy.get("main").scrollTo("bottom");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Item 40");
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
