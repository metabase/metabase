import { describeWithToken, restore } from "__support__/e2e/cypress";

describeWithToken("scenarios > saved question moderation", () => {
  describe("as an admin", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.visit("/question/2");
    });

    it("should be able to verify a saved question", () => {
      cy.findByTestId("saved-question-header-button").click();

      cy.findByTestId("moderation-verify-action").click();

      cy.findByText("You verified this").should("be.visible");

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count")
        .icon("verified")
        .should("exist");
    });

    it("should be able to unverify a verified saved question", () => {
      cy.findByTestId("saved-question-header-button").click();

      cy.findByTestId("moderation-verify-action").click();
      cy.findByTestId("moderation-remove-review-action").click();

      cy.findByText("You verified this").should("not.exist");
      cy.findByTestId("saved-question-header-button").click();

      cy.icon("verified").should("not.exist");
    });
  });

  describe("as a non-admin user", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();

      cy.intercept("GET", "/api/card/1", req => {
        req.reply(res => {
          res.body.moderation_reviews = [
            {
              status: "verified",
              most_recent: true,
              moderator_id: 999,
              id: 1,
              moderated_item_type: "card",
              moderated_item_id: 4,
              updated_at: "2021-07-23T09:56:46.276-07:00",
              created_at: "2021-07-23T09:56:46.276-07:00",
            },
          ];
        });
      }).as("cardGet");
    });

    it("should be able to see that a question has been verified", () => {
      cy.visit("/question/1");

      cy.wait("@cardGet");

      cy.icon("verified").should("exist");

      cy.findByTestId("saved-question-header-button").click();
      cy.findByText("A moderator verified this").should("exist");
    });
  });
});
