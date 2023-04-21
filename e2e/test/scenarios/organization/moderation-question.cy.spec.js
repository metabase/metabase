import {
  describeEE,
  restore,
  visitQuestion,
  openQuestionActions,
  questionInfoButton,
  getFullName,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";

const { admin } = USERS;
const adminFullName = getFullName(admin);

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
      cy.findByText(`${adminFullName} verified this`).should("not.exist");

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
      cy.findAllByText(`${adminFullName} verified this`);

      cy.findByPlaceholderText("Search…").type("orders{enter}");
      cy.findByText("Orders, Count").icon("verified");

      cy.visit("/collection/root");

      cy.findByText("Orders, Count").icon("verified");
    });
  });
});

function verifyQuestion() {
  cy.intercept("GET", "/api/card/*").as("loadCard");

  openQuestionActions();
  cy.findByTextEnsureVisible("Verify this question").click();

  cy.wait("@loadCard").then(({ response: { body } }) => {
    const { moderation_reviews } = body;

    /**
     * According to Dan's analysis, the reason behind intermittent failures in this test
     * could be the errors in H2 (app db).
     * More info: https://metaboat.slack.com/archives/C505ZNNH4/p1657300770484219?thread_ts=1657295926.728949&cid=C505ZNNH4
     *
     * We observed that even when the click on "Verify this question" was successful,
     * the response still shows `moderation_reviews` as an empty array.
     *
     * Therefore, we have to conditionally skip this test if that error occurs.
     */
    if (Array.isArray(moderation_reviews) && moderation_reviews.length === 0) {
      cy.skipOn(true);
    } else {
      const [{ status }] = moderation_reviews;

      expect(status).to.eq("verified");
    }
  });
}

function removeQuestionVerification() {
  openQuestionActions();
  cy.findByTextEnsureVisible("Remove verification").click();
}
