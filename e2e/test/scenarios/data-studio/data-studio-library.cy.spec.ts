const { H } = cy;

import {
  TRUSTED_ORDERS_METRIC,
  createLibraryWithItems,
  createLibraryWithTable,
} from "e2e/support/test-library-data";

describe("scenarios > data studio > library", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should create library via UI and verify collections", () => {
    cy.intercept("POST", "/api/ee/library").as("createLibrary");
    cy.intercept("GET", "/api/collection/tree*").as("getCollectionTree");

    cy.log("Navigate to Data Studio Library");
    H.DataModel.visitDataStudio();
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
    H.openQuestionActions("Duplicate");
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

      cy.log("Navigate back to Library via breadcrumbs");
      H.DataStudio.breadcrumbs().findByRole("link", { name: "Data" }).click();

      cy.log("Verify Data section shows the table (empty state hidden)");
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
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
  });
});
