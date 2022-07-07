import {
  describeEE,
  restore,
  visitQuestion,
  openQuestionActions,
  questionInfoButton,
} from "__support__/e2e/helpers";

describeEE("scenarios > saved question moderation", () => {
  describe("as an admin", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should be able to verify and unverify a saved question", () => {
      visitQuestion(2);

      verifyQuestion();

      // 1. Question title
      cy.findByTestId("qb-header-left-side").find(".Icon-verified");

      // 2. Question's history
      questionInfoButton().click();
      cy.findByText("History");
      cy.findAllByText("You verified this")
        .should("have.length", 2)
        .and("be.visible");

      // 3. Recently viewed list
      cy.findByPlaceholderText("Search…").click();
      cy.findByTestId("recently-viewed-item")
        .should("contain", "Orders, Count")
        .find(".Icon-verified");

      // 4. Search results
      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findAllByTestId("search-result-item")
        .contains("Orders, Count")
        .siblings(".Icon-verified");

      // 5. Question's collection
      cy.visit("/collection/root");
      cy.findByText("Orders, Count").closest("a").find(".Icon-verified");

      // Let's go back to the question and remove the verification
      visitQuestion(2);

      removeQuestionVerification();

      // 1. Question title
      cy.findByTestId("qb-header-left-side")
        .find(".Icon-verified")
        .should("not.exist");

      // 2. Question's history
      questionInfoButton().click();
      cy.findByText("History");
      cy.findByText("You removed verification");
      cy.findByText("You verified this"); // Implicit assertion - there can be only one :)

      // 3. Recently viewed list
      cy.findByPlaceholderText("Search…").click();
      cy.findByTestId("recently-viewed-item")
        .should("contain", "Orders, Count")
        .find(".Icon-verified")
        .should("not.exist");

      // 4. Search results
      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findAllByTestId("search-result-item")
        .contains("Orders, Count")
        .siblings(".Icon-verified")
        .should("not.exist");

      // 5. Question's collection
      cy.visit("/collection/root");
      cy.findByText("Orders, Count")
        .closest("a")
        .find(".Icon-verified")
        .should("not.exist");
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
  });
});

function verifyQuestion() {
  openQuestionActions();
  cy.findByTextEnsureVisible("Verify this question").click();
}

function removeQuestionVerification() {
  openQuestionActions();
  cy.findByTextEnsureVisible("Remove verification").click();
}
