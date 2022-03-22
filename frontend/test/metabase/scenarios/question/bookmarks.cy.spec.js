import { restore, sidebar } from "__support__/e2e/cypress";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

describe("scenarios > question > view", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("bookmarks", () => {
    it("should add then remove bookmark from question page", () => {
      // Add bookmark
      toggleBookmark();

      cy.visit("/collection/root");

      sidebar().within(() => {
        getSectionTitle("Bookmarks");
        cy.findByText("Orders");
      });

      // Remove bookmark
      toggleBookmark();

      cy.intercept("GET", "/api/collection/root/items?**").as(
        "fetchRootCollectionItems",
      );

      cy.visit("/collection/root");

      cy.wait("@fetchRootCollectionItems");

      getSectionTitle("Bookmarks").should("not.exist");
    });
  });
});

function toggleBookmark() {
  cy.visit("/question/1");

  cy.contains("Orders").click();

  cy.icon("bookmark").click();
}
