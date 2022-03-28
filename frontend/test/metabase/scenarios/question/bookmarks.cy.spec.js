import { restore, sidebar, visitQuestion } from "__support__/e2e/cypress";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

describe("scenarios > question > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add then remove bookmark from question page", () => {
    // Add bookmark
    toggleBookmark();

    cy.visit("/collection/root");

    sidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findByText("Orders");
    });

    // Remove bookmark
    toggleBookmark();

    cy.intercept("GET", "/api/collection/root/items?**").as(
      "fetchRootCollectionItems",
    );

    cy.visit("/collection/root");

    cy.wait("@fetchRootCollectionItems");

    getSectionTitle(/Bookmarks/).should("not.exist");
  });
});

function toggleBookmark() {
  visitQuestion(1);

  cy.findByTestId("saved-question-header-button").click();

  cy.intercept("/api/bookmark/card/*").as("toggleBookmark");

  cy.icon("bookmark").click();

  cy.wait("@toggleBookmark");
}
