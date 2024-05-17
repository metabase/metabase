import {
  READ_ONLY_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  popover,
  createNativeQuestion as _createNativeQuestion,
  selectSidebarItem,
  createQuestion as _createQuestion,
  modifyPermission,
  archiveQuestion,
  sidebar,
  entityPickerModal,
  modal,
  navigationSidebar,
  restore,
} from "e2e/support/helpers";

describe("scenarios > collections > trash", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("trash collection should be treated different in ui", () => {
    createCollection({ name: "Collection A" }, true);
    createNativeQuestion(
      {
        type: "model",
        name: "Model A",
        native: { query: "select * from products limit 5" },
      },
      true,
    );
    cy.visit("/");

    cy.log("should show trash at bottom of the side navbar");
    navigationSidebar().within(() => {
      cy.findAllByTestId("sidebar-collection-link-root")
        .last()
        .as("sidebar-trash-link")
        .should("contain", "Trash");
    });

    cy.log("should not be expandable in sidebar with items in it");
    cy.get("@sidebar-trash-link").within(() => {
      cy.icon("chevronright").should("not.be.visible");
    });

    cy.log("table headers should say deleted by / deleted at");
    cy.get("@sidebar-trash-link").click();
    cy.findByTestId("items-table-head").within(() => {
      cy.findByText("Deleted by");
      cy.findByText("Deleted at");
    });

    cy.log(
      "trashed items in collection should not have option to move to trash",
    );
    toggleEllipsisMenuFor("Collection A");
    popover().within(() => {
      cy.findByText("Move to trash").should("not.exist");
      cy.findByText("Restore").should("exist");
      cy.findByText("Delete permanently").should("exist");
    });
    toggleEllipsisMenuFor("Collection A");

    cy.log("items in trash should have greyed out icons");
    collectionTable().within(() => {
      cy.icon("model").should("have.css", "color", "rgb(148, 154, 171)");
    });

    cy.log("there should not be pins in the trash");
    cy.findByTestId("pinned-items").should("not.exist");

    cy.log("trash should not appear in 'our analtyics'");
    visitRootCollection();
    collectionTable().within(() => {
      cy.findByText("Trash").should("not.exist");
    });

    cy.log("trash should not appear in query builder source picker");
    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });
    popover().findByText("Question").click();
    popover().findByText("Models").click();
    popover().within(() => {
      cy.findByText("Our analytics").should("exist");
      cy.findByText("Trash").should("not.exist");
    });

    cy.log("trash should not appear in collection picker");
    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });
    popover().findByText("Dashboard").click();
    modal().findByText("Our analytics").click();
    entityPickerModal().within(() => {
      cy.findByText("First collection").should("exist");
      cy.findByText("Trash").should("not.exist");
    });

    cy.log("trash should not appear in collection permissions sidebar");
    cy.visit("/admin/permissions/collections");
    sidebar().findByText("Trash").should("not.exist");
  });

  it("should be able to trash & restore dashboards/collections/questions on entity page and from parent collection", () => {
    cy.log("create test resources");
    createCollection({ name: "Collection A" });
    createDashboard({ name: "Dashboard A" });
    createNativeQuestion({
      name: "Question A",
      native: { query: "select 1;" },
    });

    visitRootCollection();

    cy.log("should be able to move to trash from collection view");
    toggleEllipsisMenuFor(/Collection A/);
    popover().findByText("Move to trash").click();

    toggleEllipsisMenuFor("Dashboard A");
    popover().findByText("Move to trash").click();

    toggleEllipsisMenuFor("Question A");
    popover().findByText("Move to trash").click();

    cy.log(
      "should be able to move to restore items from trash collection view",
    );
    navigationSidebar().findByText("Trash").click();

    toggleEllipsisMenuFor(/Collection A/);
    popover().findByText("Restore").click();

    toggleEllipsisMenuFor("Dashboard A");
    popover().findByText("Restore").click();

    toggleEllipsisMenuFor("Question A");
    popover().findByText("Restore").click();

    cy.log("should be able to archive entities from their own views");
    visitRootCollection();

    // collection
    collectionTable().within(() => {
      cy.findByText("Collection A").click();
    });
    cy.findByTestId("collection-menu").find(".Icon-ellipsis").click();
    popover().findByText("Move to trash").click();
    modal().within(() => {
      cy.findByText("Move this collection to trash?");
      cy.findByText("Move to trash").click();
    });
    ensureCanRestoreFromPage("Collection A");

    // dashboard
    collectionTable().within(() => {
      cy.findByText("Dashboard A").click();
    });
    cy.findByTestId("dashboard-header").icon("ellipsis").click();
    popover().findByText("Move to trash").click();
    modal().within(() => {
      cy.findByText("Move this dashboard to trash?");
      cy.findByText("Move to trash").click();
    });
    visitRootCollection();
    collectionTable().within(() => {
      cy.findByText("Dashboard A").should("not.exist");
    });
    ensureCanRestoreFromPage("Dashboard A");

    // question
    collectionTable().within(() => {
      cy.findByText("Question A").click();
    });
    cy.findByTestId("qb-header-action-panel").icon("ellipsis").click();
    popover().findByText("Move to trash").click();
    modal().within(() => {
      cy.findByText("Move this question to trash?");
      cy.findByText("Move to trash").click();
    });
    visitRootCollection();
    collectionTable().within(() => {
      cy.findByText("Question A").should("not.exist");
    });
    ensureCanRestoreFromPage("Question A");
  });

  it("should not show restore option if entity is within nested in an archived collection list", () => {
    cy.log("create test resources");
    createCollection({ name: "Collection A" })
      .as("collectionA")
      .then(a => createCollection({ name: "Collection B", parent_id: a.id }));

    cy.get("@collectionA").then(collectionA => {
      cy.archiveCollection(collectionA.id);
    });

    cy.log("only shows restore in root trash collection");
    cy.visit("/trash");

    toggleEllipsisMenuFor("Collection A");
    popover().findByText("Restore").should("exist");
    collectionTable().findByText("Collection A").click();

    toggleEllipsisMenuFor("Collection B");
    popover().findByText("Restore").should("not.exist");

    cy.log("only shows restore on entity page if in root trash collection");
    cy.visit("/trash");
    collectionTable().findByText("Collection A").click();
    archiveBanner().findByText("Restore").should("exist");
    collectionTable().findByText("Collection B").click();
    archiveBanner().findByText("Restore").should("not.exist");
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
    popover().findByText("Move").click();
    modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    toggleEllipsisMenuFor("Dashboard A");
    popover().findByText("Move").click();
    modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });

    toggleEllipsisMenuFor("Question A");
    popover().findByText("Move").click();
    modal().within(() => {
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
    modal().within(() => {
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
    modal().within(() => {
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
    modal().within(() => {
      cy.findByText("First collection").click();
      cy.findByText("Move").click();
    });
    archiveBanner().should("not.exist");

    cy.visit("/trash");

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

    cy.visit("/trash");

    cy.log("can delete from trash list");
    toggleEllipsisMenuFor("Collection A");
    popover().findByText("Delete permanently").click();
    modal().findByText("Delete Collection A permanently?").should("exist");
    modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Collection A").should("not.exist");
    });

    toggleEllipsisMenuFor("Dashboard A");
    popover().findByText("Delete permanently").click();
    modal().findByText("Delete Dashboard A permanently?").should("exist");
    modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Dashboard A").should("not.exist");
    });

    toggleEllipsisMenuFor("Question A");
    popover().findByText("Delete permanently").click();
    modal().findByText("Delete Question A permanently?").should("exist");
    modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Question A").should("not.exist");
    });

    cy.log("should be able to delete from entity page");
    collectionTable().within(() => {
      cy.findByText("Collection B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    modal().findByText("Delete Collection B permanently?").should("exist");
    modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Collection B").should("not.exist");
    });

    collectionTable().within(() => {
      cy.findByText("Dashboard B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    modal().findByText("Delete Dashboard B permanently?").should("exist");
    modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Dashboard B").should("not.exist");
    });

    collectionTable().within(() => {
      cy.findByText("Question B").click();
    });
    archiveBanner().findByText("Delete permanently").click();
    modal().findByText("Delete Question B permanently?").should("exist");
    modal().findByText("Delete permanently").click();
    collectionTable().within(() => {
      cy.findByText("Question B").should("not.exist");
    });
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
      selectItem("Collection A");
      selectItem("Dashboard A");
      selectItem("Question A");
    });

    it("user should be able to bulk restore", () => {
      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.findByText("Delete permanently").should("not.be.disabled");
          cy.findByText("Move").should("not.be.disabled");
          cy.findByText("Restore").should("not.be.disabled").click();
        });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("not.exist");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });
    });

    it("user should be able to bulk move out of trash", () => {
      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.findByText("Restore").should("not.be.disabled");
          cy.findByText("Delete permanently").should("not.be.disabled");
          cy.findByText("Move").should("not.be.disabled").click();
        });

      modal().within(() => {
        cy.findByText("First collection").click();
        cy.findByText("Move").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("not.exist");
        cy.findByText("Dashboard A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });

      navigationSidebar().within(() => {
        cy.findByText("First collection").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("exist");
        cy.findByText("Dashboard A").should("exist");
        cy.findByText("Question A").should("exist");
      });
    });

    it("user should be able to bulk delete", () => {
      cy.findByTestId("toast-card")
        .should("be.visible")
        .within(() => {
          cy.findByText("Restore").should("not.be.disabled");
          cy.findByText("Move").should("not.be.disabled");
          cy.findByText("Delete permanently").should("not.be.disabled").click();
        });

      modal().within(() => {
        cy.findByText("Delete 3 items permanently?");
        cy.findByText("Delete permanently").click();
      });

      collectionTable().within(() => {
        cy.findByText("Collection A").should("not.exist");
        cy.findByText("Question A").should("not.exist");
      });
    });
  });

  it("users should not be able to edit archived entities", () => {
    createDashboard({ name: "Dashboard A" }, true).as("dashboard");
    createQuestion(
      {
        name: "Question A",
        query: { "source-table": 1, limit: 10 },
      },
      true,
    ).as("question");

    cy.get("@question").then(question => {
      cy.visit(`/question/${question.id}-question-a`);
      // should not have disabled actions in top navbar
      cy.findAllByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Filter").should("not.exist");
        cy.findByText("Summarize").should("not.exist");
        cy.icon("notebook").should("not.exist");
        cy.icon("bookmark").should("not.exist");
        cy.icon("ellipsis").should("not.exist");
      });

      // should not have disabled action in bottom footer
      cy.findAllByTestId("view-footer").within(() => {
        cy.findByText("Visualization").should("not.exist");
        cy.icon("bell").should("not.exist");
        cy.icon("share").should("not.exist");
      });
    });

    cy.get("@dashboard").then(dashboard => {
      cy.visit(`/dashboard/${dashboard.id}-dashboard-a`);

      cy.findAllByTestId("dashboard-header").within(() => {
        cy.icon("pencil").should("not.exist");
        cy.icon("subscription").should("not.exist");
        cy.icon("share").should("not.exist");
        cy.icon("clock").should("not.exist");
        cy.icon("bookmark").should("not.exist");
        cy.icon("ellipsis").should("not.exist");
      });
    });
  });

  it("user should not be shown restore/move/delete options in archive banner if they have view only permissions", () => {
    createCollection({ name: "Collection A" }).as("collection");

    cy.get("@collection").then(collection => {
      createNativeQuestion(
        {
          name: "Question A",
          native: { query: "select 1;" },
          collection_id: collection.id,
        },
        true,
      ).as("question");
      createDashboard(
        { name: "Dashboard A", collection_id: collection.id },
        true,
      ).as("dashboard");

      cy.visit("/admin/permissions/collections");

      selectSidebarItem("Collection A");
      const COLLECTION_ACCESS_PERMISSION_INDEX = 0;

      modifyPermission("All Users", COLLECTION_ACCESS_PERMISSION_INDEX, "View");
      modifyPermission(
        "collection",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "View",
      );
      modifyPermission("data", COLLECTION_ACCESS_PERMISSION_INDEX, "View");

      cy.button("Save changes").click();
      modal().within(() => {
        cy.findByText("Save permissions?");
        cy.findByText("Are you sure you want to do this?");
        cy.button("Yes").click();
      });

      cy.archiveCollection(collection.id);
    });

    cy.signInAsNormalUser();

    cy.get("@collection").then(collection => {
      cy.visit(`/collection/${collection.id}-collection-a`);
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
});

function toggleEllipsisMenuFor(item) {
  collectionTable().within(() => {
    cy.findByText(item)
      .closest("tr")
      .find(".Icon-ellipsis")
      .click({ force: true });
  });
}

function createCollection(collectionInfo, archive) {
  return cy
    .createCollection(collectionInfo)
    .then(({ body: collection }) =>
      Promise.all([collection, archive && cy.archiveCollection(collection.id)]),
    )
    .then(([collection]) => collection);
}

function createQuestion(questionInfo, archive) {
  return _createQuestion(questionInfo).then(({ body: question }) =>
    Promise.all([question, archive && archiveQuestion(question.id)]).then(
      ([question]) => question,
    ),
  );
}

function createNativeQuestion(questionInfo, archive) {
  return _createNativeQuestion(questionInfo).then(({ body: question }) =>
    Promise.all([question, archive && archiveQuestion(question.id)]).then(
      ([question]) => question,
    ),
  );
}

function createDashboard(dashboardInfo, archive) {
  return cy
    .createDashboard(dashboardInfo)
    .then(({ body: dashboard }) =>
      Promise.all([dashboard, archive && cy.archiveDashboard(dashboard.id)]),
    )
    .then(([dashboard]) => dashboard);
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

function ensureCanRestoreFromPage(name) {
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

function selectItem(name) {
  cy.findByText(name)
    .closest("tr")
    .within(() => cy.findByRole("checkbox").click());
}
