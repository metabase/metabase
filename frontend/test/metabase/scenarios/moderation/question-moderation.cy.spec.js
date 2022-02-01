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

      cy.findAllByText("You verified this");

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count").icon("verified");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count").icon("verified");
    });

    it("should be able to unverify a verified saved question", () => {
      cy.findByTestId("saved-question-header-button").click();

      cy.findByTestId("moderation-verify-action").click();
      cy.findByTestId("moderation-remove-review-action").click();

      cy.findByText("You verified this").should("not.be.visible");
      cy.findByTestId("saved-question-header-button").click();

      cy.icon("verified").should("not.exist");

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count").find(".Icon-verified").should("not.exist");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count").find(".Icon-verified").should("not.exist");
    });

    it("should be able to see evidence of verification/unverification in the question's timeline", () => {
      cy.findByTestId("saved-question-header-button").click();
      cy.findByText("History").click();

      cy.findByTestId("moderation-verify-action").click();
      cy.findAllByText("You verified this").should("be.visible");

      cy.findByTestId("moderation-remove-review-action").click();
      cy.findByText("You removed verification").should("be.visible");
    });
  });

  describe("as a non-admin user", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.createModerationReview({
        status: "verified",
        moderated_item_type: "card",
        moderated_item_id: 2,
      });

      cy.signInAsNormalUser();
    });

    it("should be able to see that a question has not been verified", () => {
      cy.visit("/question/3");

      cy.icon("verified").should("not.exist");

      cy.findByTestId("saved-question-header-button").click();
      cy.findByText("Bobby Tables verified this").should("not.exist");

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count, Grouped by Created At (year)")
        .find(".Icon-verified")
        .should("not.exist");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count, Grouped by Created At (year)")
        .find(".Icon-verified")
        .should("not.exist");
    });

    it("should be able to see that a question has been verified", () => {
      cy.visit("/question/2");

      cy.icon("verified");

      cy.findByTestId("saved-question-header-button").click();
      cy.findAllByText("Bobby Tables verified this");

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count").icon("verified");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count").icon("verified");
    });

    it("should be able to see the question verification in the question's timeline", () => {
      cy.visit("/question/2");

      cy.findByTestId("saved-question-header-button").click();
      cy.findByText("History").click();

      cy.findAllByText("Bobby Tables verified this").should("be.visible");
    });
  });
});
