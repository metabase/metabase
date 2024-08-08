import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  getSidebarSectionTitle,
  navigationSidebar,
  openNavigationSidebar,
  openQuestionActions,
  restore,
  visitQuestion,
} from "e2e/support/helpers";

import { toggleQuestionBookmarkStatus } from "./helpers/bookmark-helpers";

describe("scenarios > question > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.intercept("/api/bookmark/card/*").as("toggleBookmark");
    cy.signInAsAdmin();
  });

  it("should add, update bookmark name when question name is updated, then remove bookmark from question page", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    toggleQuestionBookmarkStatus();

    openNavigationSidebar();
    navigationSidebar().within(() => {
      getSidebarSectionTitle(/Bookmarks/);
      cy.findByText("Orders");
    });

    // Rename bookmarked question
    cy.findByTestId("saved-question-header-title").click().type(" 2").blur();

    navigationSidebar().within(() => {
      cy.findByText("Orders 2");
    });

    cy.log("Turn the question into a model");
    openQuestionActions();
    cy.findByRole("dialog").contains("Turn into a model").click();
    cy.findByRole("dialog").contains("Turn this into a model").click();
    cy.findByRole("status")
      .should("contain", "This is a model now.")
      // Close this toast as soon we confim it exists!
      // It lingers in the UI far too long which is causing flakiness later on
      // when we assert on the next toast (when we turn the model back to the question).
      .icon("close")
      .click();

    navigationSidebar().within(() => {
      cy.findByLabelText(/Bookmarks/)
        .icon("model")
        .should("exist");
    });

    cy.log("Turn the model back into a question");
    openQuestionActions();
    cy.findByRole("dialog").contains("Turn back to saved question").click();
    cy.findByRole("status").should("contain", "This is a question now.");

    openNavigationSidebar();
    cy.log("Should not find bookmark");
    navigationSidebar().within(() => {
      cy.findByLabelText(/Bookmarks/)
        .icon("model")
        .should("not.exist");
    });

    // Remove bookmark
    toggleQuestionBookmarkStatus({ wasSelected: true });

    navigationSidebar().within(() => {
      getSidebarSectionTitle(/Bookmarks/).should("not.exist");
      cy.findByText("Orders 2").should("not.exist");
    });
  });
});
