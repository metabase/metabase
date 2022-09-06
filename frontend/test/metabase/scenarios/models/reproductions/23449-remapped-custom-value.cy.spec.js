import { restore, openQuestionActions } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const questionDetails = { query: { "source-table": REVIEWS_ID, limit: 2 } };

describe.skip("issue 23449", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });

    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "Awful"],
        [2, "Unpleasant"],
        [3, "Meh"],
        [4, "Enjoyable"],
        [5, "Perfecto"],
      ],
    });
  });

  it("should work with the remapped custom values from data model (metabase#23449)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    cy.findByTextEnsureVisible("Perfecto");

    turnIntoModel();
    cy.findByTextEnsureVisible("Perfecto");
  });
});

function turnIntoModel() {
  cy.intercept("POST", "/api/dataset").as("dataset");

  openQuestionActions();
  cy.findByText("Turn into a model").click();
  cy.findByText("Turn this into a model").click();

  cy.wait("@dataset").then(({ response }) => {
    expect(response.body.error).to.not.exist;
  });
}
