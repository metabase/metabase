import {
  restore,
  navigationSidebar,
  openNavigationSidebar,
  sidebar,
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
    cy.findByTestId("saved-question-header-button").click();
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
});

function toggleBookmark() {
  sidebar().within(() => {
    cy.icon("bookmark").click();
  });
  cy.wait("@toggleBookmark");
}
