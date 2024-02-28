import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  navigationSidebar,
  openQuestionActions,
  openNavigationSidebar,
  visitQuestion,
} from "e2e/support/helpers";
import { getSidebarSectionTitle as getSectionTitle } from "e2e/support/helpers/e2e-collection-helpers";

describe("scenarios > question > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.intercept("/api/bookmark/card/*").as("toggleBookmark");
    cy.signInAsAdmin();
  });

  it("should add, update bookmark name when question name is updated, then remove bookmark from question page", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    toggleBookmark();

    openNavigationSidebar();
    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findByText("Orders");
      cy.icon("model").should("not.exist");
    });

    // Rename bookmarked question
    cy.findByTestId("saved-question-header-title").click().type(" 2").blur();

    navigationSidebar().within(() => {
      cy.findByText("Orders 2");
    });

    // Convert to model
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Turn into a model").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Turn this into a model").click();

    navigationSidebar().within(() => {
      cy.icon("model");
    });

    // Convert back to question
    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Turn back to saved question").click();

    navigationSidebar().within(() => {
      cy.icon("model").should("not.exist");
    });

    // Remove bookmark
    toggleBookmark({ wasSelected: true });

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/).should("not.exist");
      cy.findByText("Orders 2").should("not.exist");
    });
  });
});

function toggleBookmark({ wasSelected = false } = {}) {
  const iconName = wasSelected ? "bookmark_filled" : "bookmark";
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.icon(iconName).click();
  });
  cy.wait("@toggleBookmark");
}
