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

  it(
    "should add, update bookmark name when question name is updated, then remove bookmark from question page",
    { tags: "@flaky" },
    () => {
      visitQuestion(ORDERS_QUESTION_ID);
      toggleBookmark();

      openNavigationSidebar();
      navigationSidebar().within(() => {
        getSectionTitle(/Bookmarks/);
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
      cy.findByRole("status").contains("This is a model now.").should("exist");

      navigationSidebar().within(() => {
        cy.findByLabelText(/Bookmarks/)
          .icon("model")
          .should("exist");
      });

      cy.log("Turn the model back into a question");
      openQuestionActions();
      cy.findByRole("dialog").contains("Turn back to saved question").click();
      cy.findByRole("status")
        .contains("This is a question now.")
        .should("exist");

      openNavigationSidebar();
      cy.log("Should not find bookmark");
      navigationSidebar().within(() => {
        cy.findByLabelText(/Bookmarks/)
          .icon("model")
          .should("not.exist");
      });

      // Remove bookmark
      toggleBookmark({ wasSelected: true });

      navigationSidebar().within(() => {
        getSectionTitle(/Bookmarks/).should("not.exist");
        cy.findByText("Orders 2").should("not.exist");
      });
    },
  );
});

function toggleBookmark({ wasSelected = false } = {}) {
  const iconName = wasSelected ? "bookmark_filled" : "bookmark";
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.icon(iconName).click();
  });
  cy.wait("@toggleBookmark");
}
