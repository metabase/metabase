import { restore, sidebar } from "__support__/e2e/cypress";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

describe("Bookmarks in a collection page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("updates sidebar and bookmark icon color when bookmarking a collection in its page", () => {
    cy.request("POST", "/api/bookmark/collection/1");

    cy.visit("/collection/1");

    sidebar().within(() => {
      getSectionTitle("Bookmarks");
    });

    cy.percySnapshot();
  });

  it("can remove bookmark from item in sidebar", () => {
    cy.visit("/collection/1");

    // Add bookmark
    cy.icon("bookmark").click();

    sidebar().within(() => {
      cy.icon("bookmark").click({ force: true });
    });

    getSectionTitle("Bookmarks").should("not.exist");
  });
});
