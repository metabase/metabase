import { restore, sidebar } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

const adminFullName = USERS.admin.first_name + " " + USERS.admin.last_name;
const adminPersonalCollectionName = adminFullName + "'s Personal Collection";

describe("Bookmarks in a collection page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("cannot add bookmark to root collection", () => {
    cy.intercept("GET", "/api/collection/root/items?**").as(
      "fetchRootCollectionItems",
    );

    cy.visit("/collection/root");

    cy.wait("@fetchRootCollectionItems");

    cy.findByText("View archive");
    cy.icon("bookmark").should("not.exist");
  });

  it("can add and remove bookmarks from collection from its page", () => {
    cy.visit("/collection/1");

    // Add bookmark
    cy.icon("bookmark").click();

    sidebar().within(() => {
      getSectionTitle("Bookmarks");
      cy.findByText(adminPersonalCollectionName);

      // Once there is a list of bookmarks,
      // we add a heading to the list of collections below the list of bookmarks
      getSectionTitle("Collections");
    });

    // Remove bookmark
    cy.findByTestId("collection-menu").within(() => {
      cy.icon("bookmark").click();
    });

    sidebar().within(() => {
      cy.findByText(adminPersonalCollectionName).should("not.exist");

      getSectionTitle("Bookmarks").should("not.exist");

      // Once there is no list of bookmarks,
      // we remove the heading for the list of collections
      getSectionTitle("Collections").should("not.exist");
    });
  });

  it("can add/remove bookmark from Question in collection", () => {
    addThenRemoveBookmarkTo("Orders");
  });

  it("can add/remove bookmark from Dashboard in collection", () => {
    addThenRemoveBookmarkTo("Orders in a dashboard");
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

function addThenRemoveBookmarkTo(itemName) {
  cy.visit("/collection/root");

  openEllipsisMenuFor(itemName);
  cy.findByText("Bookmark").click();

  sidebar().within(() => {
    getSectionTitle("Bookmarks");
    cy.findByText(itemName);
  });

  openEllipsisMenuFor(itemName);

  cy.findByText("Remove bookmark").click();

  sidebar().within(() => {
    getSectionTitle("Bookmarks").should("not.exist");
    cy.findByText(itemName).should("not.exist");
  });
}

function openEllipsisMenuFor(item) {
  cy.get("td")
    .contains(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}
