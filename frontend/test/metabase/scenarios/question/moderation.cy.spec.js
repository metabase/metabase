import { describeWithToken, restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS_ID } = SAMPLE_DATASET;

describeWithToken("scenarios > saved question moderation", () => {
  describe("as an admin", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.visit("/question/1");
      cy.findByTestId("saved-question-header-button").click();
    });

    it("should be able to verify a saved question", () => {
      cy.findByTestId("moderation-verify-action").click();

      cy.findByText("You verified this").should("be.visible");
      cy.findByTestId("saved-question-header-button").click();
      cy.icon("verified").should("be.visible");
    });

    it("should be able to unverify a verified saved question", () => {
      cy.findByTestId("moderation-verify-action").click();
      cy.findByTestId("moderation-remove-review-action").click();

      cy.findByText("You verified this").should("not.be.visible");
      cy.findByTestId("saved-question-header-button").click();
      cy.icon("verified").should("not.be.visible");
    });
  });

  describe("as a non-admin user", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();
    });

    it("should be able to see that a question has been verified", () => {
      cy.createQuestion({
        name: "Verified Question",
        query: { "source-table": PRODUCTS_ID },
        moderationReviews: [
          {
            state: "verified",
            most_recent: true,
            moderator_id: 999,
            created_at: Date.now(),
          },
        ],
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.visit(`/question/${QUESTION_ID}`);
        cy.icon("verified").should("be.visible");
        cy.findByTestId("saved-question-header-button").click();
        cy.findByText("Someone verified this").should("be.visible");
      });
    });
  });
});
