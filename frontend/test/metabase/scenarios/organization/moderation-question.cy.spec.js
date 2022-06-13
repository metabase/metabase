import {
  describeEE,
  restore,
  visitQuestion,
  popover,
  openQuestionActions,
  questionInfoButton,
} from "__support__/e2e/cypress";

describeEE("scenarios > saved question moderation", () => {
  describe("as an admin", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      visitQuestion(2);
    });

    it("should be able to verify a saved question", () => {
      openQuestionActions();

      popover().within(() => {
        cy.findByTestId("moderation-verify-action").click();
        cy.findByText("Remove verification");
      });

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count").icon("verified");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count").icon("verified");
    });

    it("should be able to unverify a verified saved question", () => {
      openQuestionActions();

      popover().within(() => {
        cy.findByTestId("moderation-verify-action").click();
        cy.findByTestId("moderation-remove-verification-action").click();
      });

      cy.findByText("Verify this question").should("be.visible");

      cy.findByTestId("saved-question-header-button").within(() => {
        cy.icon("verified").should("not.exist");
      });

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count")
        .find(".Icon-verified")
        .should("not.exist");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count")
        .find(".Icon-verified")
        .should("not.exist");
    });

    it("should be able to see evidence of verification/unverification in the question's timeline", () => {
      openQuestionActions();

      popover().within(() => {
        cy.findByTestId("moderation-verify-action").click();
      });

      questionInfoButton().click();
      cy.findByText("History");

      cy.findAllByText("You verified this").should("be.visible");

      openQuestionActions();

      popover().within(() => {
        cy.findByTestId("moderation-remove-verification-action").click();
      });

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
      visitQuestion(3);

      cy.icon("verified").should("not.exist");

      questionInfoButton().click();
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
      visitQuestion(2);

      cy.icon("verified");

      questionInfoButton().click();
      cy.findAllByText("Bobby Tables verified this");

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count").icon("verified");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count").icon("verified");
    });

    it("should be able to see the question verification in the question's timeline", () => {
      visitQuestion(2);

      questionInfoButton().click();
      cy.findByText("History");

      cy.findAllByText("Bobby Tables verified this").should("be.visible");
    });
  });
});
