import {
  getCollectionIdFromSlug,
  restore,
  popover,
  navigationSidebar,
  visitCollection,
} from "e2e/support/helpers";
import { USERS, SAMPLE_DB_TABLES } from "e2e/support/cypress_data";

import { getSidebarSectionTitle as getSectionTitle } from "e2e/support/helpers/e2e-collection-helpers";

const adminFullName = USERS.admin.first_name + " " + USERS.admin.last_name;
const adminPersonalCollectionName = adminFullName + "'s Personal Collection";

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

describe("scenarios > organization > bookmarks > collection", () => {
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

    getSectionTitle("Collections");
    cy.icon("bookmark").should("not.exist");
  });

  it("can add, update bookmark name when collection name is updated, and remove bookmarks from collection from its page", () => {
    getCollectionIdFromSlug("first_collection", id => {
      visitCollection(id);
    });

    // Add bookmark
    cy.icon("bookmark").click();

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findAllByText("First collection").should("have.length", 2);

      // Once there is a list of bookmarks,
      // we add a heading to the list of collections below the list of bookmarks
      getSectionTitle("Collections");
    });

    // Rename bookmarked collection
    cy.findByTestId("collection-name-heading").click().type(" 2").blur();

    navigationSidebar().within(() => {
      cy.findAllByText("First collection 2").should("have.length", 2);
    });

    // Remove bookmark
    cy.findByTestId("collection-menu").within(() => {
      cy.icon("bookmark").click();
    });

    navigationSidebar().within(() => {
      cy.findAllByText("First collection 2").should("have.length", 1);
    });
  });

  it("can add/remove bookmark from unpinned Question in collection", () => {
    addThenRemoveBookmarkTo("Orders");
  });

  it("can add/remove bookmark from pinned Question in collection", () => {
    const name = "Orders";
    cy.visit("/collection/root");

    pin(name);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Rows/);
    bookmarkPinnedItem(name);
  });

  it("can add/remove bookmark from unpinned Dashboard in collection", () => {
    addThenRemoveBookmarkTo("Orders in a dashboard");
  });

  it("can add/remove bookmark from pinned Question in collection", () => {
    const name = "Orders in a dashboard";
    cy.visit("/collection/root");

    pin(name);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A dashboard");
    bookmarkPinnedItem(name);
  });

  it("adds and removes bookmarks from Model in collection", () => {
    cy.createQuestion({
      name: "Orders Model",
      query: { "source-table": STATIC_ORDERS_ID, aggregation: [["count"]] },
      dataset: true,
    });

    addThenRemoveBookmarkTo("Orders Model");
  });

  it("removes items from bookmarks list when they are archived", () => {
    // A question
    bookmarkThenArchive("Orders");

    // A dashboard
    bookmarkThenArchive("Orders in a dashboard");
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

function addThenRemoveBookmarkTo(name) {
  addBookmarkTo(name);
  removeBookmarkFrom(name);
}

function addBookmarkTo(name) {
  cy.visit("/collection/root");

  openEllipsisMenuFor(name);
  cy.findByText("Bookmark").click();

  navigationSidebar().within(() => {
    getSectionTitle(/Bookmarks/);
    cy.findByText(name);
  });
}

function removeBookmarkFrom(name) {
  openEllipsisMenuFor(name);

  cy.findByText("Remove from bookmarks").click();

  navigationSidebar().within(() => {
    getSectionTitle(/Bookmarks/).should("not.exist");
    cy.findByText(name).should("not.exist");
  });
}

function openEllipsisMenuFor(name) {
  cy.get("td")
    .contains(name)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

function bookmarkThenArchive(name) {
  addBookmarkTo(name);
  archive(name);
}

function pin(name) {
  openEllipsisMenuFor(name);
  popover().within(() => {
    cy.findByText("Pin this").click();
  });
}

function archive(name) {
  openEllipsisMenuFor(name);
  popover().within(() => {
    cy.findByText("Archive").click();
  });
}

function bookmarkPinnedItem(name) {
  cy.findByText(name)
    .closest("a")
    .find(".Icon-ellipsis")
    .click({ force: true });

  cy.findByText("Bookmark").click();

  navigationSidebar().within(() => {
    getSectionTitle(/Bookmarks/);
    cy.findByText(name);
  });
}
