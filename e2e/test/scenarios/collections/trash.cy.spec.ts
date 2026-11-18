import { P, isMatching } from "ts-pattern";

import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  FIRST_COLLECTION_ID,
  READ_ONLY_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { NativeQuestionDetails } from "e2e/support/helpers";
import type {
  Card,
  Collection,
  Dashboard,
  RegularCollectionId,
} from "metabase-types/api";

const { H } = cy;

const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

describe("scenarios > collections > trash", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("Snowplow analytics", () => {
    beforeEach(() => {
      H.resetSnowplow();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should be able to trash & restore dashboards/collections/questions on entity page and from parent collection", () => {
      cy.log("create test resources");
      cy.log("Bookmark the resources to test metabase#44224");
      createCollection({ name: "Collection A" }).then((collection) => {
        cy.request("POST", `/api/bookmark/collection/${collection.id}`);
      });
      createDashboard({ name: "Dashboard A" }).then((dashboard) => {
        cy.request("POST", `/api/bookmark/dashboard/${dashboard.id}`);
      });
      createNativeQuestion({
        name: "Question A",
        native: { query: "select 1;" },
      }).then((question) => {
        cy.request("POST", `/api/bookmark/card/${question.id}`);
      });

      visitRootCollection();

      cy.log("should be able to move to trash from collection view");
      toggleEllipsisMenuFor(/Collection A/);
      H.popover().findByText("Move to trash").click();
      expectMovedToTrashEvent("collection", "collection");

      toggleEllipsisMenuFor("Dashboard A");
      H.popover().findByText("Move to trash").click();
      expectMovedToTrashEvent("dashboard", "collection");

      toggleEllipsisMenuFor("Question A");
      H.popover().findByText("Move to trash").click();
      expectMovedToTrashEvent("question", "collection");

      cy.log(
        "should be able to move to restore items from trash collection view",
      );
      H.navigationSidebar().findByText("Trash").click();

      toggleEllipsisMenuFor(/Collection A/);
      H.popover().findByText("Restore").click();
      ensureBookmarkVisible(/Collection A/);

      toggleEllipsisMenuFor("Dashboard A");
      H.popover().findByText("Restore").click();
      ensureBookmarkVisible("Dashboard A");

      toggleEllipsisMenuFor("Question A");
      H.popover().findByText("Restore").click();
      ensureBookmarkVisible("Question A");

      cy.log("should be able to archive entities from their own views");
      visitRootCollection();

      // collection
      collectionTable().within(() => {
        cy.findByText("Collection A").click();
      });
      cy.findByTestId("collection-menu").find(".Icon-ellipsis").click();
      H.popover().findByText("Move to trash").click();
      H.modal().within(() => {
        cy.findByText("Move this collection to trash?");
        cy.findByText("Move to trash").click();
      });
      expectMovedToTrashEvent("collection", "detail_page");
      ensureCanRestoreFromPage("Collection A");
      ensureBookmarkVisible("Collection A");

      // dashboard
      collectionTable().within(() => {
        cy.findByText("Dashboard A").click();
      });
      cy.findByTestId("dashboard-header").icon("ellipsis").click();
      H.popover().findByText("Move to trash").click();
      H.modal().within(() => {
        cy.findByText("Move this dashboard to trash?");
        cy.findByText("Move to trash").click();
      });
      expectMovedToTrashEvent("dashboard", "detail_page");
      ensureCanRestoreFromPage("Dashboard A");
      ensureBookmarkVisible("Dashboard A");

      // question
      collectionTable().within(() => {
        cy.findByText("Question A").click();
      });
      cy.findByTestId("qb-header-action-panel").icon("ellipsis").click();
      H.popover().findByText("Move to trash").click();
      H.modal().within(() => {
        cy.findByText("Move this question to trash?");
        cy.findByText("Move to trash").click();
      });
      expectMovedToTrashEvent("question", "detail_page");
      ensureCanRestoreFromPage("Question A");
      ensureBookmarkVisible("Question A");
    });
  });

  it("should be able to move <entity> out of trash collection", () => {
    cy.log("create test resources");
    createCollection({ name: "Collection A" }, true);
    createCollection({ name: "Collection B" }, true);
    createDashboard({ name: "Dashboard A" }, true);
    createDashboard({ name: "Dashboard B" }, true);
    const query = { native: { query: "select 1;" } };
    createNativeQuestion({ name: "Question A", ...query }, true);
    createNativeQuestion({ name: "Question B", ...query }, true);

    cy.log("can move from trash list");
    cy.visit("/trash");
    toggleEllipsisMenuFor("Collection A");
    H.popover().findByText("Move").click();
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    toggleEllipsisMenuFor("Dashboard A");
    H.popover().findByText("Move").click();
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    toggleEllipsisMenuFor("Question A");
    H.popover().findByText("Move").click();
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    collectionTable().within(() => {
      cy.findByText("Collection A").should("not.exist");
      cy.findByText("Dashboard A").should("not.exist");
      cy.findByText("Question A").should("not.exist");
    });

    cy.visit(`/collection/${FIRST_COLLECTION_ID}`);

    collectionTable().within(() => {
      cy.findByText("Collection A").should("exist");
      cy.findByText("Dashboard A").should("exist");
      cy.findByText("Question A").should("exist");
    });

    cy.log("can move from entity page");
    cy.visit("/trash");
    collectionTable().within(() => {
      cy.findByText("Collection B").click();
    });
    archiveBanner().within(() => {
      cy.findByText("Move").click();
    });
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });
    archiveBanner().should("not.exist");

    cy.visit("/trash");
    collectionTable().within(() => {
      cy.findByText("Dashboard B").click();
    });
    archiveBanner().within(() => {
      cy.findByText("Move").click();
    });
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });
    archiveBanner().should("not.exist");

    cy.visit("/trash");
    collectionTable().within(() => {
      cy.findByText("Question B").click();
    });
    archiveBanner().within(() => {
      cy.findByText("Move").click();
    });
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });
    archiveBanner().should("not.exist");

    cy.visit("/trash");
    cy.findByTestId("collection-empty-state").should("be.visible");

    cy.visit(`/collection/${FIRST_COLLECTION_ID}`);

    collectionTable().within(() => {
      cy.findByText("Collection A").should("exist");
      cy.findByText("Dashboard A").should("exist");
      cy.findByText("Question A").should("exist");
    });
  });

  it("should be able to permanently delete <entity> on archived entity page or from trash & trashed collections", () => {
    cy.log("create test resources");
    createCollection({ name: "Collection A" }, true);
    createCollection({ name: "Collection B" }, true);
    createDashboard({ name: "Dashboard A" }, true);
    createDashboard({ name: "Dashboard B" }, true);
    const query = { native: { query: "select 1;" } };
    createNativeQuestion({ name: "Question A", ...query }, true);
    createNativeQuestion({ name: "Question B", ...query }, true);
    createCollection({ name: "Collection C" }).then((collectionC) => {
      createCollection({ name: "Collection D", parent_id: collectionC.id });
      H.archiveCollection(collectionC.id);
    });

    cy.visit("/trash");

    cy.log("only shows restore in root trash collection");
    toggleEllipsisMenuFor("Collection C");
    H.popover().within(() => {
      cy.findByText("Delete permanently").should("be.visible");
      cy.findByText("Restore").should("be.visible");
    });
    collectionTable().findByText("Collection C").click();
    archiveBanner().findByText("Restore").should("exist");

    toggleEllipsisMenuFor("Collection D");
    H.popover().within(() => {
      cy.findByText("Delete permanently").should("be.visible");
      cy.findByText("Restore").should("not.exist");
    });
    toggleEllipsisMenuFor("Collection D");

    cy.log("only shows restore on entity page if in root trash collection");
    collectionTable().findByText("Collection D").click();
    cy.findByTestId("collection-name-heading").should(
      "have.text",
      "Collection D",
    );
    archiveBanner().within(() => {
      cy.findByText("Delete permanently").should("be.visible");
      cy.findByText("Restore").should("not.exist");
    });

    cy.log("can delete from a trashed collection");
    cy.go("back");
    cy.findByTestId("collection-name-heading").should(
      "have.text",
      "Collection C",
    );
    toggleEllipsisMenuFor("Collection D");
    H.popover().findByText("Delete permanently").click();
    H.modal().findByText("Delete Collection D permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    cy.findByTestId("collection-empty-state").should("be.visible");

    archiveBanner().findByText("Delete permanently").click();
    H.modal().findByText("Delete Collection C permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Collection A").should("exist");
      cy.findByText("Collection C").should("not.exist");
    });

    cy.log("can delete from trash list");
    toggleEllipsisMenuFor("Collection A");
    H.popover()
      .should("contain", "Delete permanently")
      .findByText("Delete permanently")
      .click();
    H.modal().findByText("Delete Collection A permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Collection A").should("not.exist");
    });

    toggleEllipsisMenuFor("Dashboard A");
    H.popover()
      .should("contain", "Delete permanently")
      .findByText("Delete permanently")
      .click();
    H.modal().findByText("Delete Dashboard A permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Dashboard A").should("not.exist");
    });

    toggleEllipsisMenuFor("Question A");
    H.popover()
      .should("contain", "Delete permanently")
      .findByText("Delete permanently")
      .click();
    H.modal().findByText("Delete Question A permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Question A").should("not.exist");
    });

    cy.log("should be able to delete from entity page");
    collectionTable().within(() => {
      cy.findByText("Collection B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    H.modal().findByText("Delete Collection B permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Collection B").should("not.exist");
    });

    collectionTable().within(() => {
      cy.findByText("Dashboard B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    H.modal().findByText("Delete Dashboard B permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Dashboard B").should("not.exist");
    });

    collectionTable().within(() => {
      cy.findByText("Question B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    H.modal().findByText("Delete Question B permanently?").should("exist");
    H.modal().findByText("Delete permanently").click();
    cy.findByTestId("collection-empty-state").should("be.visible");
  });

  describe("bulk actions", () => {
    beforeEach(() => {
      createCollection({ name: "Collection A" }, true);
      createDashboard({ name: "Dashboard A" }, true);
      createNativeQuestion(
        { name: "Question A", native: { query: "select 1;" } },
        true,
      );
      cy.visit("/trash");
    });

    it("user should be able to bulk restore and bulk move out of trash", () => {
      createCollection({ name: "Collection B" }, true);
      createDashboard({ name: "Dashboard B" }, true);
      createNativeQuestion(
        { name: "Question B", native: { query: "select 1;" } },
        true,
      );
      cy.visit("/trash");

      cy.log("user should be able to bulk restore");
      selectItem("Collection A");
      selectItem("Dashboard A");
      selectItem("Question A");

      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.button("Delete permanently").should("be.enabled");
          cy.button("Move").should("be.enabled");
          cy.button("Restore").should("be.enabled").click();
        });

      collectionTable().within(() => {
        cy.findByText("Collection B").should("exist");
        cy.findByText("Collection A").should("not.exist");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });
      cy.findByTestId("toast-card").should("not.exist");

      visitRootCollection();
      collectionTable().within(() => {
        cy.findByText("Collection A").should("exist");
        cy.findByText("Dashboard A").should("exist");
        cy.findByText("Question A").should("exist");
      });
      cy.visit("/trash");

      cy.log("user should be able to bulk move out of trash");
      selectItem("Collection B");
      selectItem("Dashboard B");
      selectItem("Question B");

      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.button("Restore").should("be.enabled");
          cy.button("Delete permanently").should("be.enabled");
          cy.button("Move").should("be.enabled").click();
        });

      H.modal().within(() => {
        cy.findByText("First collection").click();
        cy.findByText("Move").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection B").should("not.exist");
        cy.findByText("Dashboard B").should("not.exist");
        cy.findByText("Question B").should("not.exist");
      });

      H.navigationSidebar().within(() => {
        cy.findByText("First collection").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection B").should("exist");
        cy.findByText("Dashboard B").should("exist");
        cy.findByText("Question B").should("exist");
      });
    });

    it("user should be able to bulk delete", () => {
      selectItem("Dashboard A");
      selectItem("Question A");

      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.button("Restore").should("be.enabled");
          cy.button("Move").should("be.enabled");
          cy.button("Delete permanently").should("be.enabled").click();
        });

      H.modal().within(() => {
        cy.findByText("Delete 2 items permanently?");
        cy.findByText("Delete permanently").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("exist");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });
    });
  });

  it("user should not be shown restore/move/delete options in archive banner if they have view only permissions", () => {
    createCollection({ name: "Collection A" }).then((collection) => {
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [collection.id]: "read" as const },
        [COLLECTION_GROUP]: { [collection.id]: "read" as const },
        [DATA_GROUP]: { [collection.id]: "read" as const },
      });

      H.archiveCollection(collection.id);

      cy.signInAsNormalUser();

      H.visitCollection(collection.id);
      archiveBanner().findByText("Restore").should("not.exist");
      archiveBanner().findByText("Move").should("not.exist");
      archiveBanner().findByText("Delete permanently").should("not.exist");
    });
  });

  it("should hide read-only archived items in trash (metabase#24018)", () => {
    const READ_ONLY_NAME = "read-only dashboard";
    const CURATEABLE_NAME = "curate-able dashboard";

    // setup archive with read-only collection items
    createDashboard(
      {
        name: READ_ONLY_NAME,
        collection_id: null,
      },
      true,
    );

    // setup archive with curate-able collection items (user created items)
    cy.signIn("readonly");

    createDashboard(
      {
        name: CURATEABLE_NAME,
        collection_id: READ_ONLY_PERSONAL_COLLECTION_ID,
      },
      true,
    );

    // assert on desired behavior for read-only user
    cy.visit("/trash");

    cy.get("main").within(() => {
      cy.findByText(READ_ONLY_NAME).should("not.exist");
      cy.findByText(CURATEABLE_NAME).should("be.visible");
    });

    // assert on desired behavior for admin user
    cy.signInAsAdmin();
    cy.visit("/trash");

    cy.get("main").within(() => {
      cy.findByText(READ_ONLY_NAME).should("be.visible");
      cy.findByText(CURATEABLE_NAME).should("be.visible");
    });
  });

  describe("sidebar drag and drop", () => {
    it("should not allow items in the trash to be moved into the trash, but allow items to be moved out of and into the trash and allow it to be undone", () => {
      createDashboard({ name: "Dashboard A" }, true).then((dashboard) => {
        cy.wrap(dashboard.id).as("dashboardId");
      });
      cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
      cy.visit("/trash");

      cy.log("should not allow items in the trash to be moved into the trash");
      dragAndDrop(
        H.main().findByText("Dashboard A"),
        H.navigationSidebar().findByText("Trash"),
      );

      cy.wait(100); // small wait to make sure a network request could have gone out
      // assert no update request went out
      cy.get("@updateDashboard.all").should("have.length", 0);
      cy.findByTestId("toast-undo").should("not.exist");
      H.main().within(() => {
        cy.findByText("Dashboard A").should("exist");
        cy.findByText(/Deleted items will appear here/).should("not.exist");
      });

      cy.log(
        "should allow items in the trash to be moved out of the trash and allow it to be undone",
      );
      dragAndDrop(
        H.main().findByText("Dashboard A"),
        H.navigationSidebar().findByText("First collection"),
      );

      cy.get("@updateDashboard.all").should("have.length", 1);
      H.main()
        .findByText(/Deleted items will appear here/)
        .should("exist");
      cy.findByTestId("toast-undo").should("exist");
      H.undo();

      cy.get("@updateDashboard.all").should("have.length", 2);
      H.main().within(() => {
        cy.findByText(/Deleted items will appear here/).should("not.exist");
        cy.findByText("Dashboard A").should("exist");
      });

      cy.log(
        "should allow items outside the trash to be moved in the trash and allow it to be undone",
      );
      cy.get<Dashboard["id"]>("@dashboardId").then((dashboardId) => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          archived: false,
          collection_id: FIRST_COLLECTION_ID,
        });
      });
      H.visitCollection(FIRST_COLLECTION_ID);

      dragAndDrop(
        H.main().findByText("Dashboard A"),
        H.navigationSidebar().findByText("Trash"),
      );

      cy.get("@updateDashboard.all").should("have.length", 3);
      H.main().findByText("Dashboard A").should("not.exist");
      cy.findByTestId("toast-undo").should("exist");
      H.undo();

      cy.get("@updateDashboard.all").should("have.length", 4);
      H.main().within(() => {
        cy.findByText("Dashboard A").should("exist");
      });
    });
  });
});

function toggleEllipsisMenuFor(item: string | RegExp) {
  collectionTable()
    .findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click();
}

function createCollection(
  collectionDetails: {
    name: string;
    parent_id?: RegularCollectionId | null;
  },
  archive = false,
): Cypress.Chainable<Collection> {
  return H.createCollection(collectionDetails).then(({ body: collection }) => {
    if (archive) {
      H.archiveCollection(collection.id);
    }
    return cy.wrap(collection);
  });
}

function createNativeQuestion(
  questionDetails: NativeQuestionDetails,
  archive = false,
): Cypress.Chainable<Card> {
  return H.createNativeQuestion(questionDetails).then(({ body: question }) => {
    if (archive) {
      H.archiveQuestion(question.id);
    }
    return cy.wrap(question);
  });
}

function createDashboard(
  dashboardDetails: Parameters<typeof H.createDashboard>[0],
  archive = false,
): Cypress.Chainable<Dashboard> {
  return H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    if (archive) {
      H.archiveDashboard(dashboard.id);
    }
    return cy.wrap(dashboard);
  });
}

function expectMovedToTrashEvent(
  eventDetail: "collection" | "dashboard" | "question",
  triggeredFrom: "collection" | "detail_page",
) {
  H.expectUnstructuredSnowplowEvent((event: unknown) =>
    isMatching(
      {
        event: "moved-to-trash",
        event_detail: eventDetail,
        target_id: P.number,
        triggered_from: triggeredFrom,
        duration_ms: P.number,
        result: "success",
      },
      event,
    ),
  );
}

function visitRootCollection() {
  cy.visit("/collection/root");
}

function collectionTable() {
  return cy.findByTestId("collection-table");
}

function archiveBanner() {
  return cy.findByTestId("archive-banner");
}

function ensureCanRestoreFromPage(name: string) {
  visitRootCollection();
  collectionTable().within(() => {
    cy.findByText(name).should("not.exist");
  });
  cy.go("back");
  archiveBanner().should("exist");
  archiveBanner().findByText("Restore").click();
  archiveBanner().should("not.exist");
  visitRootCollection();
  collectionTable().within(() => {
    cy.findByText(name).should("exist");
  });
}

function selectItem(name: string) {
  cy.findByText(name)
    .closest("tr")
    .findByRole("checkbox")
    .closest("button")
    .click();
}

function ensureBookmarkVisible(bookmark: string | RegExp) {
  cy.findByRole("section", { name: "Bookmarks" })
    .findByText(bookmark)
    .should("be.visible");
}

function dragAndDrop(
  subjectEl: Cypress.Chainable<JQuery<HTMLElement>>,
  targetEl: Cypress.Chainable<JQuery<HTMLElement>>,
) {
  const dataTransfer = new DataTransfer();
  subjectEl.trigger("dragstart", { dataTransfer });
  targetEl.trigger("drop", { dataTransfer });
  subjectEl.trigger("dragend");
}
