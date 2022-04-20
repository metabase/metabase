import { restore, navigationSidebar } from "__support__/e2e/cypress";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";
import { pinItem } from "__support__/e2e/helpers/e2e-pin-helpers";

describe("Bookmarks in a collection page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("updates sidebar and bookmark icon color when bookmarking unpinned items in a collection page", () => {
    createAndBookmarkAnOfficialCollection();
    bookmarkExistingItems();

    cy.visit("/collection/1");

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
    });

    cy.percySnapshot();
  });

  it("updates sidebar and bookmark icon color when bookmarking pinned items in a collection page", () => {
    const itemTitle = "Orders in a dashboard";

    cy.visit("/collection/root");
    pinItem(itemTitle);
    cy.findByText("A dashboard");
    openEllipsisMenuFor(itemTitle);
    cy.findByText("Bookmark").click();

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findByText(itemTitle);
    });
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

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("a")
    .find(".Icon-ellipsis")
    .click({ force: true });
}
