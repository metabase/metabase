import { restore, navigationSidebar } from "__support__/e2e/helpers";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

describe("Bookmarks in a collection page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("updates sidebar and bookmark icon color when bookmarking a collection in its page", () => {
    createAndBookmarkAnOfficialCollection();
    bookmarkExistingItems();

    cy.visit("/collection/1");

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
    });

    cy.percySnapshot();
  });
});

function createAndBookmarkAnOfficialCollection() {
  cy.createCollection({
    name: "An official collection",
    authority_level: "official",
  }).then(response => {
    const { id } = response.body;
    cy.request("POST", `/api/bookmark/collection/${id}`);
  });
}

function bookmarkExistingItems() {
  cy.request("POST", "/api/bookmark/card/1");
  cy.request("POST", "/api/bookmark/card/2");
  cy.request("POST", "/api/bookmark/card/3");
  cy.request("POST", "/api/bookmark/collection/1");
  cy.request("POST", "/api/bookmark/dashboard/1");
}
