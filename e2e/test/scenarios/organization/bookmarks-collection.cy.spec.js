const { H } = cy;
import { SAMPLE_DB_TABLES, USERS } from "e2e/support/cypress_data";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const adminFullName = USERS.admin.first_name + " " + USERS.admin.last_name;
const adminPersonalCollectionName = adminFullName + "'s Personal Collection";

const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

describe("scenarios > organization > bookmarks > collection", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  it("cannot add bookmark to root collection", () => {
    H.visitCollection("root");

    H.getSidebarSectionTitle("Collections");
    cy.icon("bookmark").should("not.exist");
  });

  it("can add, update bookmark name when collection name is updated, and remove bookmarks from collection from its page", () => {
    H.visitCollection(FIRST_COLLECTION_ID);

    // Add bookmark
    cy.icon("bookmark").click();

    H.expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "collection",
      triggered_from: "collection_header",
    });

    H.navigationSidebar().within(() => {
      H.getSidebarSectionTitle(/Bookmarks/);
      cy.findAllByText("First collection").should("have.length", 2);

      // Once there is a list of bookmarks,
      // we add a heading to the list of collections below the list of bookmarks
      H.getSidebarSectionTitle("Collections");
    });

    // Rename bookmarked collection
    cy.findByTestId("collection-name-heading").click().type(" 2").blur();

    H.navigationSidebar()
      .findAllByText("First collection 2")
      .should("have.length", 2);

    // Remove bookmark
    cy.findByTestId("collection-menu").icon("bookmark_filled").click();

    H.navigationSidebar()
      .findAllByText("First collection 2")
      .should("have.length", 1);

    cy.findByTestId("collection-menu")
      .icon("bookmark_filled")
      .should("not.exist");
    cy.findByTestId("collection-menu").icon("bookmark").should("exist");
  });

  it("removes items from bookmarks list when they are archived", () => {
    // A question
    bookmarkThenArchive("Orders");

    // A dashboard
    bookmarkThenArchive("Orders in a dashboard");
  });

  it("should update bookmarks list when restoring a collection containing bookmarked items (metabase#44499)", () => {
    const collectionName = "First collection";
    const questionName = "Orders in First Collection";

    // Create a question in the collection and bookmark it
    H.createQuestion({
      name: questionName,
      query: { "source-table": STATIC_ORDERS_ID },
      collection_id: FIRST_COLLECTION_ID,
    }).then(({ body: { id: questionId } }) => {
      cy.request("POST", `/api/bookmark/card/${questionId}`);
    });

    H.visitCollection("root");

    // Verify bookmark appears in sidebar
    H.navigationSidebar()
      .findByRole("section", { name: "Bookmarks" })
      .should("contain", questionName);

    // Archive the collection
    H.openCollectionItemMenu(collectionName);
    H.popover().findByTextEnsureVisible("Move to trash").click();

    // The bookmarked question should be removed from bookmarks
    H.navigationSidebar()
      .findByRole("section", { name: "Bookmarks" })
      .should("not.exist");

    // Restore the collection
    cy.visit("/trash");
    H.openCollectionItemMenu(collectionName);
    H.popover().findByTextEnsureVisible("Restore").click();

    // The bookmarked question should reappear in bookmarks
    H.navigationSidebar()
      .findByRole("section", { name: "Bookmarks" })
      .should("contain", questionName);
  });

  it("can remove bookmark from item in sidebar", () => {
    H.visitCollection(ADMIN_PERSONAL_COLLECTION_ID);

    // Add bookmark
    cy.findByTestId("collection-menu").icon("bookmark").click();

    H.navigationSidebar().within(() => {
      cy.icon("bookmark_filled").click({ force: true });
    });

    H.getSidebarSectionTitle(/Bookmarks/).should("not.exist");
  });

  it("can toggle bookmark list visibility", () => {
    H.visitCollection(ADMIN_PERSONAL_COLLECTION_ID);

    // Add bookmark
    cy.icon("bookmark").click();

    H.navigationSidebar().within(() => {
      H.getSidebarSectionTitle(/Bookmarks/).click();

      cy.findByText(adminPersonalCollectionName).should("not.exist");

      H.getSidebarSectionTitle(/Bookmarks/).click();

      cy.findByText(adminPersonalCollectionName);
    });
  });

  describe("collection items", () => {
    it("can add/remove bookmark from unpinned Question in collection", () => {
      addBookmarkTo("Orders");
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "question",
        triggered_from: "collection_list",
      });
      removeBookmarkFrom("Orders");
      H.expectUnstructuredSnowplowEvent(
        {
          event: "bookmark_added",
          event_detail: "question",
          triggered_from: "collection_list",
        },
        1,
      );
    });

    it("can add/remove bookmark from pinned Question in collection", () => {
      const name = "Orders";
      H.visitCollection("root");

      pin(name);
      H.tableHeaderColumn("ID");
      bookmarkPinnedItem(name);

      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "question",
        triggered_from: "collection_list",
      });
    });

    it("can add/remove bookmark from unpinned Dashboard in collection", () => {
      addBookmarkTo("Orders in a dashboard");
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "dashboard",
        triggered_from: "collection_list",
      });
      removeBookmarkFrom("Orders in a dashboard");
      H.expectUnstructuredSnowplowEvent(
        {
          event: "bookmark_added",
          event_detail: "dashboard",
          triggered_from: "collection_list",
        },
        1,
      );
    });

    it("can add/remove bookmark from pinned Dashboard in collection", () => {
      const name = "Orders in a dashboard";
      H.visitCollection("root");

      pin(name);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("A dashboard");
      bookmarkPinnedItem(name);
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "dashboard",
        triggered_from: "collection_list",
      });
    });

    it("adds and removes bookmarks from Model in collection", () => {
      H.createQuestion({
        name: "Orders Model",
        query: { "source-table": STATIC_ORDERS_ID, aggregation: [["count"]] },
        type: "model",
      });

      addBookmarkTo("Orders Model");
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "model",
        triggered_from: "collection_list",
      });

      removeBookmarkFrom("Orders Model");
      H.expectUnstructuredSnowplowEvent(
        {
          event: "bookmark_added",
          event_detail: "model",
          triggered_from: "collection_list",
        },
        1,
      );
    });

    it("can bookmark a collection", () => {
      const collectionName = "First collection";

      addBookmarkTo(collectionName);
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "collection",
        triggered_from: "collection_list",
      });

      removeBookmarkFrom(collectionName);
      H.expectUnstructuredSnowplowEvent(
        {
          event: "bookmark_added",
          event_detail: "collection",
          triggered_from: "collection_list",
        },
        1,
      );
    });
  });
});

function addBookmarkTo(name) {
  H.visitCollection("root");

  H.openCollectionItemMenu(name);
  H.popover().findByTextEnsureVisible("Bookmark").click();

  H.navigationSidebar()
    .findByRole("section", { name: "Bookmarks" })
    .should("contain", name);
}

function removeBookmarkFrom(name) {
  H.openCollectionItemMenu(name);

  H.popover().findByTextEnsureVisible("Remove from bookmarks").click();

  H.navigationSidebar()
    .findByRole("section", { name: "Bookmarks" })
    .should("not.exist");
}

function bookmarkThenArchive(name) {
  addBookmarkTo(name);
  archive(name);
}

function pin(name) {
  H.openCollectionItemMenu(name);
  H.popover().findByTextEnsureVisible("Pin this").click();
}

function archive(name) {
  H.openCollectionItemMenu(name);
  H.popover().findByTextEnsureVisible("Move to trash").click();
}

function bookmarkPinnedItem(name) {
  cy.findByText(name)
    .closest("a")
    .find(".Icon-ellipsis")
    .click({ force: true });

  cy.findByText("Bookmark").click();

  H.navigationSidebar().within(() => {
    H.getSidebarSectionTitle(/Bookmarks/);
    cy.findByText(name);
  });
}
