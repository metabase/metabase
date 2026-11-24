const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { TRUSTED_ORDERS_METRIC } from "e2e/support/test-library-data";
import type { Collection } from "metabase-types/api";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > library", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should create library via UI and verify collections", () => {
    H.resetSnowplow();
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
    // Let the Data Studio index redirect settle.
    cy.location("pathname").should("not.eq", "/data-studio");

    cy.log(
      "Verify tracking event when opening Data Studio from the profile menu",
    );
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_opened",
      triggered_from: "nav_menu",
    });
    H.DataStudio.nav().findByLabelText("Semantic layer").click();

    cy.log("Create library via inline empty state");
    H.DataStudio.Library.libraryPage().within(() => {
      cy.findByText("A source of truth for analytics").should("be.visible");
      cy.findByText("Create my semantic layer").click();
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
  });

  it("should let you move metrics into the library, even when empty", () => {
    cy.intercept("POST", "/api/card").as("createCard");
    H.createLibrary();
    H.createQuestion(TRUSTED_ORDERS_METRIC, { visitQuestion: true });
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Duplicate").click();
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();

    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Metrics").click();
    H.entityPickerModal().button("Select this collection").click();
    H.modal().button("Duplicate").click();
    cy.wait("@createCard").its("response.statusCode").should("eq", 200);

    H.DataStudio.Library.visit();
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric - Duplicate")
      .should("be.visible");
  });

  describe("Library collection management", () => {
    it("should create, edit, move, and archive library collections and move a published table", () => {
      H.createCollection({ name: "Outside Library" });
      H.createLibrary().then(({ dataCollectionId }) => {
        createLibraryCollection({
          name: "Collection Before Edit",
          description: "Original description",
          parent_id: dataCollectionId,
        });
        createLibraryCollection({
          name: "Destination Collection",
          parent_id: dataCollectionId,
        });
        createLibraryCollection({
          name: "Collection To Move",
          parent_id: dataCollectionId,
        });
        H.publishTables({ table_ids: [ORDERS_ID] });
        createLibraryCollection({
          name: "Table Destination Collection",
          parent_id: dataCollectionId,
        });
        createLibraryCollection({
          name: "Collection To Archive",
          parent_id: dataCollectionId,
        });
      });

      H.DataStudio.Library.visit();

      cy.intercept("POST", "/api/collection").as("createCollection");
      cy.intercept("PUT", "/api/collection/*").as("updateCollection");
      cy.intercept("PUT", "/api/table/*").as("updateTable");

      cy.log("Create a new library collection from the New button");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Collection").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").type("New Library Collection");
        cy.findByTestId("collection-picker-button").should("contain", "Data");
        cy.findByTestId("collection-picker-button").click();
      });

      H.entityPickerModalItem(0, "Library").should("be.visible");
      H.entityPickerModalItem(1, "Data").should("be.visible");

      cy.log("Check that non-library collections are not visible");
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

      cy.log("Edit a library collection name and description");
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

      cy.log("Move a library collection to another subcollection");
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

      H.DataStudio.Library.expandCollection("Destination Collection");
      H.DataStudio.Library.result("Collection To Move")
        .should("be.visible")
        .and("have.attr", "aria-level", "3");

      cy.log("Move a published table to a library subcollection");
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

      H.DataStudio.Library.expandCollection("Table Destination Collection");
      H.DataStudio.Library.result("Orders")
        .should("be.visible")
        .and("have.attr", "aria-level", "3");

      cy.log("Archive a library collection and show it in trash");
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
  });

  describe("published tables", () => {
    it("should publish a table from the New menu, show its overview, and unpublish it", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Publish a table from the 'New' menu");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Published table").click();
      H.pickEntity({
        path: ["Databases", /Sample Database/, "Orders"],
        select: true,
      });

      H.modal().findByText("Publish to").should("be.visible");
      H.modal().findByText("Data").should("be.visible");
      H.modal().button("Publish this table").click();

      cy.log("Verify the overview of the published table");
      H.DataStudio.Tables.overviewPage().should("exist");
      H.DataStudio.Tables.header().findByDisplayValue("Orders").should("exist");
      H.queryVisualizationRoot().within(() => {
        cy.findByText("Subtotal").should("be.visible");
        cy.findByText("110.93").should("be.visible");
      });

      cy.log("Verify the published table in the library after a reload");
      H.DataStudio.Library.visit();
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      H.DataStudio.Library.emptyStateRow(
        "Standardized calculations with known dimensions",
      ).should("be.visible");

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
      H.entityPickerModal().button("Close").click();

      cy.log("Unpublish the table");
      H.DataStudio.Library.tableItem("Orders").click();
      H.DataStudio.Tables.moreMenu().click();
      H.popover().findByText("Unpublish").click();
      H.modal().findByText("Unpublish this table").click();
      H.DataStudio.Library.emptyStateRow(
        "Cleaned, pre-transformed data sources ready for exploring",
      ).should("be.visible");

      cy.log("Verify the table is not in the library after a reload");
      H.DataStudio.Library.visit();
      H.DataStudio.Library.emptyStateRow(
        "Cleaned, pre-transformed data sources ready for exploring",
      ).should("be.visible");
      H.DataStudio.Library.allTableItems().should("have.length", 0);
    });

    it("should rename a field and view the table in the query builder", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
      H.tableHeaderColumn("Total").should("be.visible");

      cy.log("Rename a field");
      H.DataStudio.Tables.fieldsTab().click();
      H.DataModel.TableSection.clickField("Total");
      H.DataModel.FieldSection.getNameInput()
        .clear()
        .type("Total changed")
        .blur();
      H.undoToast().findByText("Name of Total updated").should("be.visible");

      H.DataStudio.Tables.overviewTab().click();
      H.tableHeaderColumn("Total changed").should("be.visible");

      cy.log("View the table in the query builder");
      H.DataStudio.Tables.moreMenu().click();
      H.DataStudio.Tables.moreMenuViewTable();

      H.queryBuilderHeader().within(() => {
        cy.icon("repository").should("be.visible");
        cy.findByText("Data").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
    });
  });

  describe("bulk actions", () => {
    it("selects, moves, and unpublishes library items in bulk", () => {
      H.createLibrary().then(({ dataCollectionId }) => {
        H.publishTables({
          table_ids: [ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID],
        });
        createLibraryCollection({
          name: "Folder A",
          parent_id: dataCollectionId,
        });
        createLibraryCollection({
          name: "Folder B",
          parent_id: dataCollectionId,
        });
        createLibraryCollection({
          name: "Folder C",
          parent_id: dataCollectionId,
        });
        createLibraryCollection({
          name: "Folder D",
          parent_id: dataCollectionId,
        });
      });
      H.DataStudio.Library.visit();

      cy.log(
        "Bulk-move tables into a sub-collection (picker defaults to Library)",
      );
      H.DataStudio.Library.selectRow("Products");
      H.DataStudio.Library.selectRow("People");
      bulkBar().findByText("2 items selected").should("be.visible");
      bulkBar().findByRole("button", { name: "Move" }).click();
      // Folder A (a Data sub-collection) is visible without navigating, proving
      // the picker opened inside the Library rather than at Our analytics.
      H.entityPickerModalItem(2, "Folder A").should("be.visible").click();
      H.entityPickerModal().button("Move").click();
      H.DataStudio.Library.expandCollection("Folder A");
      H.DataStudio.Library.result("Products").should(
        "have.attr",
        "aria-level",
        "3",
      );
      H.DataStudio.Library.result("People").should(
        "have.attr",
        "aria-level",
        "3",
      );

      cy.log("Bulk-move a collection — can't move into itself; no Unpublish");
      H.DataStudio.Library.selectRow("Folder B");
      bulkBar().findByText("1 item selected").should("be.visible");
      bulkBar().findByText("Unpublish").should("not.exist");
      bulkBar().findByRole("button", { name: "Move" }).click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(2, "Folder B").should(
          "have.attr",
          "data-disabled",
        );
        H.entityPickerModalItem(2, "Folder C").click();
        cy.button("Move").click();
      });
      H.DataStudio.Library.expandCollection("Folder C");
      H.DataStudio.Library.result("Folder B").should(
        "have.attr",
        "aria-level",
        "3",
      );

      cy.log("Bulk-unpublish removes the selected tables from the Library");
      H.DataStudio.Library.selectRow("Orders");
      H.DataStudio.Library.selectRow("Reviews");
      bulkBar().findByText("2 items selected").should("be.visible");
      bulkBar().findByRole("button", { name: "Unpublish" }).click();
      H.modal().within(() => {
        cy.findByText("Unpublish these tables?").should("be.visible");
        cy.button("Unpublish these tables").click();
      });

      // Gate on positive signals (bar cleared, Folder A re-rendered) so the
      // checks don't pass against the transient post-unpublish loading state.
      bulkBar().should("not.exist");
      H.DataStudio.Library.collectionItem("Folder A").should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Orders")
        .should("not.exist");
      H.DataStudio.Library.libraryPage()
        .findByText("Reviews")
        .should("not.exist");

      cy.log("Move multiple collections to trash (confirm warns of unpublish)");
      H.DataStudio.Library.selectRow("Folder A");
      H.DataStudio.Library.selectRow("Folder C");
      bulkBar().findByText("2 items selected").should("be.visible");
      bulkBar().findByText("Unpublish").should("not.exist");
      bulkBar().findByRole("button", { name: "Move to trash" }).click();
      H.modal().within(() => {
        cy.findByText("Move to trash?").should("be.visible");
        // Plural wording, since multiple collections are selected.
        cy.findByText(/these collections will also unpublish/).should(
          "be.visible",
        );
        cy.button("Move to trash").click();
      });

      bulkBar().should("not.exist");
      H.DataStudio.Library.collectionItem("Folder D").should("be.visible");
      H.DataStudio.Library.collectionItem("Folder A").should("not.exist");
      H.DataStudio.Library.collectionItem("Folder C").should("not.exist");
    });

    it("subsumes a collection's descendants so moving the parent preserves nesting", () => {
      H.createLibrary().then(({ dataCollectionId }) => {
        createLibraryCollection({
          name: "Parent Folder",
          parent_id: dataCollectionId,
        }).then((parent) => {
          H.publishTables({ table_ids: [ORDERS_ID], collection_id: parent.id });
          createLibraryCollection({
            name: "Child Folder",
            parent_id: parent.id,
          });
        });
        createLibraryCollection({
          name: "Target Folder",
          parent_id: dataCollectionId,
        });
      });
      H.DataStudio.Library.visit();

      cy.log("Select the folder's table, then the folder that subsumes it");
      H.DataStudio.Library.expandCollection("Parent Folder");
      H.DataStudio.Library.selectRow("Orders");
      H.DataStudio.Library.selectRow("Parent Folder");
      bulkBar().findByText("1 item selected").should("be.visible");

      cy.log("Moving the parent carries the descendants, keeping nesting");
      bulkBar().findByRole("button", { name: "Move" }).click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(2, "Target Folder").click();
        cy.button("Move").click();
      });

      H.DataStudio.Library.expandCollection("Target Folder");
      H.DataStudio.Library.result("Parent Folder").should(
        "have.attr",
        "aria-level",
        "3",
      );
      H.DataStudio.Library.expandCollection("Parent Folder");
      H.DataStudio.Library.result("Orders").should(
        "have.attr",
        "aria-level",
        "4",
      );
      H.DataStudio.Library.result("Child Folder").should(
        "have.attr",
        "aria-level",
        "4",
      );
    });
  });
});

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

function bulkBar() {
  return cy.findByTestId("toast-card");
}
