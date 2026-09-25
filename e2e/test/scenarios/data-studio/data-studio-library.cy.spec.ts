const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  TRUSTED_ORDERS_METRIC,
  createLibraryWithTable,
} from "e2e/support/test-library-data";
import type { Collection } from "metabase-types/api";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID } = SAMPLE_DATABASE;

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

  it("should be available in the data picker, even if only 1 child collection has items", () => {
    createLibraryWithTable();

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

  it("should let you duplicate a metric into the empty library", () => {
    H.createLibrary();
    getLibraryRootCollections().then(({ metricCollection }) => {
      cy.wrap(metricCollection.id).as("metricCollectionId");
    });
    H.createQuestion(TRUSTED_ORDERS_METRIC, { visitQuestion: true });
    cy.intercept("POST", "/api/card").as("createCard");

    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Duplicate").click();
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();

    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Metrics").click();
    H.entityPickerModal().button("Select this collection").click();
    H.modal().button("Duplicate").click();

    cy.get<number>("@metricCollectionId").then((metricCollectionId) => {
      cy.wait("@createCard")
        .its("response.body.collection_id")
        .should("eq", metricCollectionId);
    });
  });

  describe("+New button", () => {
    it("should publish a table, hide the Data empty state, and disable already published tables", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();
      H.DataStudio.Library.emptyStateRow(
        "Cleaned, pre-transformed data sources ready for exploring",
      ).should("be.visible");

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
      H.DataStudio.Tables.overviewPage().should("be.visible");
      H.DataStudio.Tables.header()
        .findByDisplayValue("Orders")
        .should("be.visible");
      H.DataStudio.breadcrumbs().findByRole("link", { name: "Data" }).click();
      H.DataStudio.Library.tableItem("Orders").should("be.visible");

      cy.log(
        "Navigate back via the Library breadcrumb: empty sections stay expanded",
      );
      H.DataStudio.Library.tableItem("Orders").click();
      H.DataStudio.Tables.overviewPage().should("be.visible");
      H.DataStudio.breadcrumbs()
        .findByRole("link", { name: "Library" })
        .click();
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      H.DataStudio.Library.emptyStateRow(
        "Standardized calculations with known dimensions",
      ).should("be.visible");
      H.DataStudio.Library.emptyStateRow(
        "Reusable bits of code that save your time",
      ).should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
        .should("not.exist");

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
    it("should create, edit, and archive a library collection", () => {
      H.createLibrary();
      H.createCollection({ name: "Outside Library" });
      H.DataStudio.Library.visit();

      cy.intercept("POST", "/api/collection").as("createCollection");
      cy.intercept("PUT", "/api/collection/*").as("updateCollection");

      cy.log("Create a collection from the New button");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Collection").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").type("Collection Before Edit");
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
      cy.wait("@createCollection")
        .its("response.statusCode")
        .should("eq", 200);

      H.DataStudio.Library.collectionItem("Collection Before Edit").should(
        "be.visible",
      );

      cy.log("Edit the collection name and description");
      openCollectionOptions("Collection Before Edit");
      H.popover().findByText("Edit collection details").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("Collection After Edit");
        cy.findByLabelText("Description")
          .clear()
          .type("Updated library description");
        cy.button("Save").click();
      });

      cy.wait("@updateCollection").then(({ request, response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(request.body).to.include({
          name: "Collection After Edit",
          description: "Updated library description",
        });
      });

      H.DataStudio.Library.collectionItem("Collection After Edit").should(
        "be.visible",
      );
      H.DataStudio.Library.libraryPage()
        .findByText("Collection Before Edit")
        .should("not.exist");

      cy.log("Archive the collection and find it in the trash");
      openCollectionOptions("Collection After Edit");
      H.popover().findByText("Archive").click();
      H.modal().button("Archive").click();

      cy.wait("@updateCollection")
        .its("response.statusCode")
        .should("eq", 200);
      H.undoToast()
        .findByText('"Collection After Edit" has been archived')
        .should("be.visible");
      H.DataStudio.Library.collectionItem("Data").should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Collection After Edit")
        .should("not.exist");

      cy.visit("/trash");
      cy.findByRole("table")
        .findByText("Collection After Edit")
        .should("be.visible");
    });

    it("should move a library collection and a published table into subcollections", () => {
      H.createLibrary();
      getLibraryRootCollections().then(({ dataCollection }) => {
        H.publishTables({ table_ids: [ORDERS_ID] });
        createLibraryCollection({
          name: "Destination Collection",
          parent_id: dataCollection.id,
        });
        createLibraryCollection({
          name: "Collection To Move",
          parent_id: dataCollection.id,
        });
        createLibraryCollection({
          name: "Table Destination Collection",
          parent_id: dataCollection.id,
        });
      });

      H.DataStudio.Library.visit();

      cy.intercept("PUT", "/api/collection/*").as("updateCollection");
      cy.intercept("PUT", "/api/table/*").as("updateTable");

      cy.log("Move a collection via its details modal");
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

      cy.wait("@updateCollection")
        .its("response.statusCode")
        .should("eq", 200);

      H.DataStudio.Library.expandCollection("Destination Collection");
      H.DataStudio.Library.result("Collection To Move")
        .should("be.visible")
        .and("have.attr", "aria-level", "3");

      cy.log("Move a published table via its options menu");
      openTableOptions("Orders");
      H.popover().findByText("Move").click();

      H.entityPickerModalItem(1, "Metrics").should(
        "have.attr",
        "data-disabled",
      );
      H.entityPickerModalItem(2, "Table Destination Collection").click();
      H.entityPickerModal().button("Move").click();

      cy.wait("@updateTable").its("response.statusCode").should("eq", 200);

      H.DataStudio.Library.expandCollection("Table Destination Collection");
      H.DataStudio.Library.result("Orders")
        .should("be.visible")
        .and("have.attr", "aria-level", "3");
    });
  });

  describe("bulk actions", () => {
    it("selects, moves, and unpublishes library items in bulk", () => {
      H.createLibrary();
      getLibraryRootCollections().then(
        ({ dataCollection, metricCollection }) => {
          H.publishTables({
            table_ids: [ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID],
          });
          H.createQuestion({ ...TRUSTED_ORDERS_METRIC }).then(
            ({ body: card }) => {
              cy.request("PUT", `/api/card/${card.id}`, {
                collection_id: metricCollection.id,
              });
            },
          );
          createLibraryCollection({
            name: "Folder A",
            parent_id: dataCollection.id,
          });
          createLibraryCollection({
            name: "Folder B",
            parent_id: dataCollection.id,
          });
          createLibraryCollection({
            name: "Folder C",
            parent_id: dataCollection.id,
          });
          createLibraryCollection({
            name: "Folder D",
            parent_id: dataCollection.id,
          });
        },
      );
      H.DataStudio.Library.visit();

      cy.log("Section-root checkbox selects every item in the section");
      H.DataStudio.Library.selectRow("Data");
      H.DataStudio.Library.rowCheckbox("Orders").should("be.checked");
      H.DataStudio.Library.rowCheckbox("Reviews").should("be.checked");
      H.DataStudio.Library.rowCheckbox("Folder A").should("be.checked");
      bulkBar().findByRole("button", { name: "Clear" }).click();
      bulkBar().should("not.exist");

      cy.log("Selection is limited to one section, replacing across sections");
      H.DataStudio.Library.selectRow("Orders");
      bulkBar().findByText("1 item selected").should("be.visible");
      // A table is selected, so Move to trash is hidden (tables are unpublished).
      bulkBar().findByText("Move to trash").should("not.exist");
      H.DataStudio.Library.selectRow(TRUSTED_ORDERS_METRIC.name);
      bulkBar().findByText("1 item selected").should("be.visible");
      H.DataStudio.Library.rowCheckbox("Orders").should("not.be.checked");
      H.DataStudio.Library.rowCheckbox(TRUSTED_ORDERS_METRIC.name).should(
        "be.checked",
      );
      bulkBar().findByRole("button", { name: "Clear" }).click();
      bulkBar().should("not.exist");

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
      H.createLibrary();
      getLibraryRootCollections().then(({ dataCollection }) => {
        createLibraryCollection({
          name: "Parent Folder",
          parent_id: dataCollection.id,
        }).then((parent) => {
          H.publishTables({ table_ids: [ORDERS_ID], collection_id: parent.id });
          createLibraryCollection({
            name: "Child Folder",
            parent_id: parent.id,
          });
        });
        createLibraryCollection({
          name: "Target Folder",
          parent_id: dataCollection.id,
        });
      });
      H.DataStudio.Library.visit();

      cy.log("Selecting the parent collection subsumes its table and folder");
      H.DataStudio.Library.expandCollection("Parent Folder");
      H.DataStudio.Library.selectRow("Orders");
      bulkBar().findByText("1 item selected").should("be.visible");
      H.DataStudio.Library.selectRow("Parent Folder");

      H.DataStudio.Library.rowCheckbox("Orders").should("be.checked");
      H.DataStudio.Library.rowCheckbox("Orders").should("be.disabled");
      H.DataStudio.Library.result("Orders").should(
        "have.attr",
        "data-disabled",
      );
      H.DataStudio.Library.rowCheckbox("Child Folder").should("be.checked");
      H.DataStudio.Library.rowCheckbox("Child Folder").should("be.disabled");
      // The count reflects only the top level items selected
      bulkBar().findByText("1 item selected").should("be.visible");

      cy.log("Collapsing the parent keeps its subsumed selection intact");
      H.DataStudio.Library.collapseCollection("Parent Folder");
      H.DataStudio.Library.libraryPage()
        .findByText("Orders")
        .should("not.exist");
      bulkBar().findByText("1 item selected").should("be.visible");

      cy.log(
        "Moving the collapsed parent carries the descendants, keeping nesting",
      );
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
        // Unjustified type cast. FIXME
        dataCollection: dataCollection as Collection,
        // Unjustified type cast. FIXME
        metricCollection: metricCollection as Collection,
      };
    });
}

function createLibraryCollection({
  name,
  parent_id,
}: {
  name: string;
  parent_id: Collection["id"];
}) {
  return cy
    .request<Collection>("POST", "/api/collection", {
      name,
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
