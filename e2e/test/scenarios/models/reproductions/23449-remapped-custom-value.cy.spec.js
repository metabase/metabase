import { restore, openQuestionActions } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const questionDetails = { query: { "source-table": REVIEWS_ID, limit: 2 } };

describe("issue 23449", () => {
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
  cy.intercept("PUT", "/api/card/*").as("cardUpdate");

  openQuestionActions();
  cy.findByText("Turn into a model").click();
  cy.findByText("Turn this into a model").click();

  cy.wait("@cardUpdate").then(({ response }) => {
    expect(response.body.error).to.not.exist;
  });
}
