import {
  restore,
  navigationSidebar,
  openNavigationSidebar,
  visitQuestion,
} from "__support__/e2e/helpers";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

describe("scenarios > question > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.intercept("/api/bookmark/card/*").as("toggleBookmark");
    cy.signInAsAdmin();
  });

  it("should add then remove bookmark from question page", () => {
    visitQuestion(1);
    toggleBookmark();

    openNavigationSidebar();
    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findByText("Orders");
    });

    // Remove bookmark
    toggleBookmark();

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/).should("not.exist");
      cy.findByText("Orders").should("not.exist");
    });
  });

  it("should update name in bookmarks list when bookmarked question name is updated", () => {
    visitQuestion(1);
    toggleBookmark();

    openNavigationSidebar();
    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findByText("Orders");
    });

    cy.findByTestId("saved-question-header-title").click().type(" 2").blur();

    navigationSidebar().within(() => {
      cy.findByText("Orders 2");
    });
  });
});

function toggleBookmark() {
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.icon("bookmark").click();
  });
  cy.wait("@toggleBookmark");
}
