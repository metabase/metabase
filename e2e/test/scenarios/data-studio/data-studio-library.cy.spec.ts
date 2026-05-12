const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  TRUSTED_ORDERS_METRIC,
  createLibraryWithItems,
  createLibraryWithTable,
} from "e2e/support/test-library-data";
import type { Collection } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

type LibraryResponse = Collection & {
  effective_children?: Collection[];
};

type LibraryRootCollections = {
  dataCollection: Collection;
  metricCollection: Collection;
};

describe("scenarios > data studio > library", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should create library via UI and verify collections", () => {
    cy.intercept("POST", "/api/ee/library").as("createLibrary");
    cy.intercept("GET", "/api/collection/tree*").as("getCollectionTree");

    cy.log("Navigate to Data Studio Library");
    /**
     * Let's use the profile menu to navigate to Data Studio in this test, just
     * to make sure it works, and to test the analytics event
     */
    cy.visit("/");
    H.getProfileLink().click();
    H.popover()
      .findByText(/Data studio/)
      .click();

    cy.log(
      "Verify tracking event when opening Data Studio from the profile menu",
    );
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_opened",
      triggered_from: "nav_menu",
    });
    H.DataStudio.nav().findByLabelText("Library").click();

    cy.log("Create library via inline empty state");
    H.DataStudio.Library.libraryPage().within(() => {
      cy.findByText("A source of truth for analytics").should("be.visible");
      cy.findByText("Create my Library").click();
    });

    cy.wait("@createLibrary");
    cy.wait("@getCollectionTree");

    cy.log("Verify tracking event is triggered");
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_library_created",
    });

    cy.log("Verify library collections appear in the library table");
    H.DataStudio.Library.collectionItem("Data").should("be.visible");
    H.DataStudio.Library.collectionItem("Metrics").should("be.visible");
    H.DataStudio.Library.collectionItem("SQL snippets").should("be.visible");
  });

  it("should be available in the data picker", () => {
    createLibraryWithItems();

    H.startNewQuestion();
    H.miniPickerBrowseAll().click();

    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Data").click();
    H.entityPickerModalItem(2, "Orders").click();

    cy.log("Ensure that the we can build the path from a value");

    cy.button(/Orders/).click();
    H.miniPickerHeader().click();
    H.miniPickerBrowseAll().click();

    H.entityPickerModalItem(0, "Library").should(
      "have.attr",
      "data-active",
      "true",
    );
    H.entityPickerModalItem(1, "Data").should(
      "have.attr",
      "data-active",
      "true",
    );
    H.entityPickerModalItem(2, "Orders").should(
      "have.attr",
      "data-active",
      "true",
    );
  });

  it("should let you move metrics into the library, even when empty", () => {
    H.createLibrary();
    H.createQuestion(TRUSTED_ORDERS_METRIC, { visitQuestion: true });
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Duplicate").click();
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();

    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Metrics").click();
    H.entityPickerModal().button("Select this collection").click();
    H.modal().button("Duplicate").click();
  });

  it("should show the library collection even if only 1 child collection has items", () => {
    createLibraryWithTable();

    H.startNewQuestion();
    H.miniPickerBrowseAll().click();

    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Data").click();
    H.entityPickerModalItem(2, "Orders").should("exist");
  });

  describe("+New button", () => {
    it("should allow you to publish a table", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Publish a table from the 'New' menu");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Published table").click();

      cy.log("Select a table and click 'Publish'");
      H.pickEntity({
        path: ["Databases", /Sample Database/, "Orders"],
        select: true,
      });

      H.modal().findByText("Publish to").should("be.visible");
      H.modal().findByText("Data").should("be.visible");
      H.modal().button("Publish this table").click();

      cy.log("Verify the table is published");
      H.DataStudio.Tables.overviewPage().should("exist");
      H.DataStudio.Tables.header().findByDisplayValue("Orders").should("exist");
      H.DataStudio.breadcrumbs().findByRole("link", { name: "Data" }).click();
      H.DataStudio.Library.tableItem("Orders").should("exist");

      cy.log(
        "Verify tables in the entity picker are disabled if already published",
      );
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Published table").click();
      H.entityPickerModalItem(1, /Sample Database/).click();
      H.entityPickerModalItem(2, "Orders").should("have.attr", "data-disabled");
      H.entityPickerModalItem(2, "People").should(
        "not.have.attr",
        "data-disabled",
      );
    });
  });

  describe("Library collection management", () => {
    it("should create a new library collection from the New button", () => {
      H.createLibrary();
      H.createCollection({ name: "Outside Library" });
      H.DataStudio.Library.visit();

      cy.intercept("POST", "/api/collection").as("createCollection");

      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Collection").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").type("New Library Collection");
        cy.findByTestId("collection-picker-button").should("contain", "Data");
        cy.findByTestId("collection-picker-button").click();
      });

      H.entityPickerModalItem(0, "Library").should("be.visible");
      H.entityPickerModalItem(1, "Data").should("be.visible");

      cy.log("Check that non-library collection are not visible");
      H.entityPickerModal().findByText("Our analytics").should("not.exist");
      H.entityPickerModal().findByText("Outside Library").should("not.exist");
      H.entityPickerModal().button("Cancel").click();

      H.modal().button("Create").click();
      cy.wait("@createCollection").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      H.DataStudio.Library.collectionItem("New Library Collection").should(
        "be.visible",
      );
    });

    it("should edit a library collection name and description", () => {
      H.createLibrary();
      getLibraryRootCollections().then(({ dataCollection }) => {
        createLibraryCollection({
          name: "Collection Before Edit",
          description: "Original description",
          parent_id: dataCollection.id,
        });
      });

      H.DataStudio.Library.visit();

      cy.intercept("PUT", "/api/collection/*").as("updateCollection");

      openCollectionOptions("Collection Before Edit");
      H.popover().findByText("Edit collection details").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("Collection After Edit");
        cy.findByLabelText("Description")
          .clear()
          .type("Updated library description");
        cy.button("Save").click();
      });

      cy.wait("@updateCollection").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      H.DataStudio.Library.collectionItem("Collection After Edit").should(
        "be.visible",
      );
      H.DataStudio.Library.libraryPage()
        .findByText("Collection Before Edit")
        .should("not.exist");
    });

    it("should move a library collection to another subcollection", () => {
      H.createLibrary();
      getLibraryRootCollections().then(({ dataCollection }) => {
        createLibraryCollection({
          name: "Destination Collection",
          parent_id: dataCollection.id,
        });
        createLibraryCollection({
          name: "Collection To Move",
          parent_id: dataCollection.id,
        });
      });

      H.DataStudio.Library.visit();

      cy.intercept("PUT", "/api/collection/*").as("updateCollection");

      openCollectionOptions("Collection To Move");
      H.popover().findByText("Edit collection details").click();

      H.modal().findByTestId("collection-picker-button").click();
      H.entityPickerModalItem(1, "Metrics").should(
        "have.attr",
        "data-disabled",
      );
      H.entityPickerModalItem(2, "Destination Collection").click();
      H.entityPickerModal().button("Select").click();
      H.modal().button("Save").click();

      cy.wait("@updateCollection").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      expandLibraryCollection("Destination Collection");
      H.DataStudio.Library.result("Collection To Move")
        .should("be.visible")
        .and("have.attr", "aria-level", "3");
    });

    it("should archive a library collection and show it in trash", () => {
      H.createLibrary();
      getLibraryRootCollections().then(({ dataCollection }) => {
        createLibraryCollection({
          name: "Collection To Archive",
          parent_id: dataCollection.id,
        });
      });

      H.DataStudio.Library.visit();

      cy.intercept("PUT", "/api/collection/*").as("updateCollection");

      openCollectionOptions("Collection To Archive");
      H.popover().findByText("Archive").click();
      H.modal().button("Archive").click();

      cy.wait("@updateCollection").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });
      H.undoToast()
        .findByText('"Collection To Archive" has been archived')
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Collection To Archive")
        .should("not.exist");

      cy.visit("/trash");
      cy.findByRole("table")
        .findByText("Collection To Archive")
        .should("be.visible");
    });

    it("should move a published table to a library subcollection", () => {
      H.createLibrary();
      getLibraryRootCollections().then(({ dataCollection }) => {
        H.publishTables({ table_ids: [ORDERS_ID] });
        createLibraryCollection({
          name: "Table Destination Collection",
          parent_id: dataCollection.id,
        });
      });

      H.DataStudio.Library.visit();

      cy.intercept("PUT", "/api/table/*").as("updateTable");

      openTableOptions("Orders");
      H.popover().findByText("Move").click();

      H.entityPickerModalItem(1, "Metrics").should(
        "have.attr",
        "data-disabled",
      );
      H.entityPickerModalItem(2, "Table Destination Collection").click();
      H.entityPickerModal().button("Move").click();

      cy.wait("@updateTable").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
      });

      expandLibraryCollection("Table Destination Collection");
      H.DataStudio.Library.result("Orders")
        .should("be.visible")
        .and("have.attr", "aria-level", "3");
    });
  });

  describe("empty state", () => {
    it("should show empty states with interactions when sections are empty", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Verify all sections are expanded");
      H.DataStudio.Library.collectionItem("Data").should("be.visible");
      H.DataStudio.Library.collectionItem("Metrics").should("be.visible");
      H.DataStudio.Library.collectionItem("SQL snippets").should("be.visible");

      cy.log("Verify Data section empty state");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByRole("button", { name: "Publish a table" })
        .should("be.visible");

      cy.log("Verify Metrics section empty state");
      H.DataStudio.Library.libraryPage()
        .findByText("Standardized calculations with known dimensions")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByRole("link", { name: "New metric" })
        .should("be.visible");

      cy.log("Verify SQL snippets section empty state");
      H.DataStudio.Library.libraryPage()
        .findByText("Reusable bits of code that save your time")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByRole("link", { name: "New snippet" })
        .should("be.visible");

      cy.log("Click on 'Publish a table' button and verify modal opens");
      H.DataStudio.Library.libraryPage()
        .findByRole("button", { name: "Publish a table" })
        .click();
      H.entityPickerModal().should("be.visible");
      H.entityPickerModalItem(1, "Sample Database").click();
      H.entityPickerModalItem(2, "Orders").should("exist");
      H.entityPickerModal().button("Close").click();

      cy.log("Search for text and verify empty states are excluded");
      H.DataStudio.Library.libraryPage()
        .findByPlaceholderText("Search...")
        .type("Publish");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
        .should("not.exist");
    });

    it("should hide empty states when items are added and keep empty sections expanded on navigation", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Verify Data empty state is visible initially");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
        .should("be.visible");

      cy.log("Publish a table via the +New menu");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Published table").click();
      H.entityPickerModalItem(1, "Sample Database").click();
      H.entityPickerModalItem(2, "Orders").click();
      H.entityPickerModal().button("Publish").click();
      H.modal().findByText("Publish to").should("be.visible");
      H.modal().findByText("Data").should("be.visible");
      H.modal().button("Publish this table").click();

      cy.log("Navigate back to Library via breadcrumbs");
      H.DataStudio.breadcrumbs()
        .findByRole("link", { name: "Library" })
        .click();

      cy.log("Verify Data section shows the table (empty state hidden)");
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText(
          "Cleaned, pre-transformed data sources ready for exploring.",
        )
        .should("not.exist");

      cy.log(
        "Verify Metrics and SQL snippets still show empty states (always expanded behavior)",
      );
      H.DataStudio.Library.libraryPage()
        .findByText("Standardized calculations with known dimensions")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Reusable bits of code that save your time")
        .should("be.visible");
    });

    describe("read-only mode", () => {
      beforeEach(() => {
        H.setupGitSync();
        H.configureGit("read-only");
        H.createLibrary();
      });

      it("should hide +New button and empty state actions in read-only mode", () => {
        H.DataStudio.Library.visit();

        cy.log("Verify +New button is not visible");
        H.DataStudio.Library.newButton().should("not.exist");

        cy.log("Verify Data section empty state action is not visible");
        H.DataStudio.Library.libraryPage()
          .findByText(
            "Cleaned, pre-transformed data sources ready for exploring",
          )
          .should("be.visible");
        H.DataStudio.Library.libraryPage()
          .findByRole("button", { name: "Publish a table" })
          .should("not.exist");

        cy.log("Verify Metrics section empty state action is not visible");
        H.DataStudio.Library.libraryPage()
          .findByText("Standardized calculations with known dimensions")
          .should("be.visible");
        H.DataStudio.Library.libraryPage()
          .findByRole("link", { name: "New metric" })
          .should("not.exist");

        cy.log("Verify SQL snippets section empty state action is not visible");
        H.DataStudio.Library.libraryPage()
          .findByText("Reusable bits of code that save your time")
          .should("be.visible");
        H.DataStudio.Library.libraryPage()
          .findByRole("link", { name: "New snippet" })
          .should("not.exist");
      });
    });
  });
});

function getLibraryRootCollections(): Cypress.Chainable<LibraryRootCollections> {
  return cy
    .request<LibraryResponse>("GET", "/api/ee/library")
    .then(({ body }) => {
      const dataCollection = body.effective_children?.find(
        (collection) => collection.type === "library-data",
      );
      const metricCollection = body.effective_children?.find(
        (collection) => collection.type === "library-metrics",
      );

      expect(dataCollection, "Data collection").to.exist;
      expect(metricCollection, "Metrics collection").to.exist;

      return {
        dataCollection: dataCollection as Collection,
        metricCollection: metricCollection as Collection,
      };
    });
}

function createLibraryCollection({
  name,
  description = null,
  parent_id,
}: {
  name: string;
  description?: string | null;
  parent_id: Collection["id"];
}) {
  return cy
    .request<Collection>("POST", "/api/collection", {
      name,
      description,
      parent_id,
    })
    .its("body");
}

function openCollectionOptions(name: string) {
  H.DataStudio.Library.result(name)
    .findByLabelText("Collection options")
    .click();
}

function openTableOptions(name: string) {
  H.DataStudio.Library.result(name)
    .findByLabelText("Show table options")
    .click();
}

function expandLibraryCollection(name: string) {
  H.DataStudio.Library.result(name)
    .findByRole("button", { name: "Expand" })
    .click();
}
