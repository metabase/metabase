import { restore, popover, navigationSidebar } from "__support__/e2e/cypress";
import { USERS, SAMPLE_DB_TABLES } from "__support__/e2e/cypress_data";

import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

const adminFullName = USERS.admin.first_name + " " + USERS.admin.last_name;
const adminPersonalCollectionName = adminFullName + "'s Personal Collection";

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

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

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findByText(adminPersonalCollectionName);

      // Once there is a list of bookmarks,
      // we add a heading to the list of collections below the list of bookmarks
      getSectionTitle("Collections");
    });

    // Remove bookmark
    cy.findByTestId("collection-menu").within(() => {
      cy.icon("bookmark").click();
    });

    navigationSidebar().within(() => {
      cy.findByText(adminPersonalCollectionName).should("not.exist");

      getSectionTitle(/Bookmarks/).should("not.exist");

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

  it("adds and removes bookmarks from Model in collection", () => {
    cy.createQuestion({
      name: "Orders Model",
      query: { "source-table": STATIC_ORDERS_ID, aggregation: [["count"]] },
      dataset: true,
    });

    addThenRemoveBookmarkTo("Orders Model");
  });

  it("removes item from bookmarks list when it is archived", () => {
    const itemName = "Orders";

    addBookmarkTo(itemName);

    archive(itemName);

    navigationSidebar().within(() => {
      cy.findByText("Collections").should("not.exist");
    });
  });

  it("can remove bookmark from item in sidebar", () => {
    cy.visit("/collection/1");

    // Add bookmark
    cy.icon("bookmark").click();

    navigationSidebar().within(() => {
      cy.icon("bookmark").click({ force: true });
    });

    getSectionTitle(/Bookmarks/).should("not.exist");
  });

  it("can toggle bookmark list visibility", () => {
    cy.visit("/collection/1");

    // Add bookmark
    cy.icon("bookmark").click();

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/).click();

      cy.findByText(adminPersonalCollectionName).should("not.exist");

      getSectionTitle(/Bookmarks/).click();

      cy.findByText(adminPersonalCollectionName);
    });
  });
});

function addThenRemoveBookmarkTo(itemName) {
  addBookmarkTo(itemName);
  removeBookmarkFrom(itemName);
}

function addBookmarkTo(itemName) {
  cy.visit("/collection/root");

  openEllipsisMenuFor(itemName);
  cy.findByText("Bookmark").click();

  navigationSidebar().within(() => {
    getSectionTitle(/Bookmarks/);
    cy.findByText(itemName);
  });
}

function removeBookmarkFrom(itemName) {
  openEllipsisMenuFor(itemName);

  cy.findByText("Remove bookmark").click();

  navigationSidebar().within(() => {
    getSectionTitle(/Bookmarks/).should("not.exist");
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

function archive(itemName) {
  openEllipsisMenuFor(itemName);
  popover().within(() => {
    cy.findByText("Archive").click();
  });
}
