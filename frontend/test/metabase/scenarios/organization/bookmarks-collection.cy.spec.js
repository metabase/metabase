import { restore, popover, navigationSidebar } from "__support__/e2e/helpers";
import { USERS, SAMPLE_DB_TABLES } from "__support__/e2e/cypress_data";

import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

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
    });
  });

  it("can add/remove bookmark from unpinned Question in collection", () => {
    addThenRemoveBookmarkTo("Orders");
  });

  it("can add/remove bookmark from pinned Question in collection", () => {
    const name = "Orders";

    cy.visit("/collection/root");

    pin(name);

    cy.findByText(/Rows/);

    cy.findByText(name)
      .closest("a")
      .find(".Icon-ellipsis")
      .click({ force: true });

    cy.findByText("Bookmark").click();

    navigationSidebar().within(() => {
      getSectionTitle(/Bookmarks/);
      cy.findByText(name);
    });
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
  cy.get("td")
    .contains(name)
    .closest("tr")
    .find(".Icon-pin")
    .click();
}

function archive(name) {
  openEllipsisMenuFor(name);
  popover().within(() => {
    cy.findByText("Archive").click();
  });
}
