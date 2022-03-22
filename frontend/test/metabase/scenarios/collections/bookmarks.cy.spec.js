import _ from "underscore";
import { restore, sidebar } from "__support__/e2e/cypress";

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
      cy.findByText("Bookmarks");
      cy.findByText("Bobby Tables's Personal Collection");

      // Once there is a list of bookmarks,
      // we add a heading to the list of collections below the list of bookmarks
      cy.findByText("Collections");
    });

    // Remove bookmark
    cy.findByTestId("collection-menu").within(() => {
      cy.icon("bookmark").click();
    });

    sidebar().within(() => {
      cy.findByText("Bobby Tables's Personal Collection").should("not.exist");
      cy.findByText("Bookmarks").should("not.exist");

      // Once there is no list of bookmarks,
      // we remove the heading for the list of collections
      cy.findByText("Collections").should("not.exist");
    });
  });

  it("can add/remove bookmark from question in collection", () => {
    addThenRemoveBookmarkTo("Orders");
  });

  it("can add/remove bookmark from question in collection", () => {
    addThenRemoveBookmarkTo("Orders in a dashboard");
  });
});

function addThenRemoveBookmarkTo(itemName) {
  cy.visit("/collection/root");

  openEllipsisMenuFor(itemName);
  cy.findByText("Bookmark").click();

  sidebar().within(() => {
    cy.findByText("Bookmarks");
    cy.findByText(itemName);
  });

  openEllipsisMenuFor(itemName);

  cy.findByText("Remove bookmark").click();

  sidebar().within(() => {
    cy.findByText("Bookmarks").should("not.exist");
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
