import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

import { toggleQuestionBookmarkStatus } from "./helpers/bookmark-helpers";

describe("scenarios > question > bookmarks", () => {
  beforeEach(() => {
    cy.restore();
    cy.intercept("/api/bookmark/card/*").as("toggleBookmark");
    cy.signInAsAdmin();
  });

  it("should add, update bookmark name when question name is updated, then remove bookmark from question page", () => {
    cy.visitQuestion(ORDERS_QUESTION_ID);
    toggleQuestionBookmarkStatus();

    cy.openNavigationSidebar();
    cy.navigationSidebar().within(() => {
      cy.getSidebarSectionTitle(/Bookmarks/);
      cy.findByText("Orders");
    });

    // Rename bookmarked question
    cy.findByTestId("saved-question-header-title").click().type(" 2").blur();

    cy.navigationSidebar().within(() => {
      cy.findByText("Orders 2");
    });

    cy.log("Turn the question into a model");
    cy.openQuestionActions();
    cy.findByRole("menu").contains("Turn into a model").click();
    cy.findByRole("dialog").contains("Turn this into a model").click();
    cy.findByRole("status")
      .should("contain", "This is a model now.")
      // Close this toast as soon we confim it exists!
      // It lingers in the UI far too long which is causing flakiness later on
      // when we assert on the next toast (when we turn the model back to the question).
      .icon("close")
      .click();

    cy.navigationSidebar().within(() => {
      cy.findByLabelText(/Bookmarks/)
        .icon("model")
        .should("exist");
    });

    cy.log("Turn the model back into a question");
    cy.openQuestionActions();
    cy.findByRole("menu").contains("Turn back to saved question").click();
    cy.findByRole("status").should("contain", "This is a question now.");

    cy.openNavigationSidebar();
    cy.log("Should not find bookmark");
    cy.navigationSidebar().within(() => {
      cy.findByLabelText(/Bookmarks/)
        .icon("model")
        .should("not.exist");
    });

    // Remove bookmark
    toggleQuestionBookmarkStatus({ wasSelected: true });

    cy.navigationSidebar().within(() => {
      cy.getSidebarSectionTitle(/Bookmarks/).should("not.exist");
      cy.findByText("Orders 2").should("not.exist");
    });
  });
});
