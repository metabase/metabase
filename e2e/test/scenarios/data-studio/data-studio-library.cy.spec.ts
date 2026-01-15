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

    cy.log("Closing the modal should send you back");
    H.modal().button("Cancel").click();
    H.DataModel.get().should("exist");

    cy.log("Create library via modal");
    H.DataStudio.nav().findByLabelText("Library").click();
    H.modal().within(() => {
      cy.findByText("Create your Library").should("be.visible");
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

    H.entityPickerModalTab("Collections").click();
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
      H.popover().findByText("Publish a table").click();

      cy.log("Select a table and click 'Publish'");
      H.entityPickerModalItem(3, "Orders").click();
      H.entityPickerModal().button("Publish").click();

      cy.log("Verify the table is published");
      H.DataStudio.Tables.overviewPage().should("exist");
      H.DataStudio.Tables.header().findByDisplayValue("Orders").should("exist");
      H.DataStudio.breadcrumbs().findByRole("link", { name: "Data" }).click();
      H.DataStudio.Library.tableItem("Orders").should("exist");

      cy.log(
        "Verify tables in the entity picker are disabled if already published",
      );
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Publish a table").click();
      H.entityPickerModalItem(3, "Orders").should("have.attr", "data-disabled");
      H.entityPickerModalItem(3, "People").should(
        "not.have.attr",
        "data-disabled",
      );
    });
  });

  describe("empty state", () => {
    it("should show empty states with action links when sections are empty", () => {
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
    });

    it("should open publish table modal when clicking 'Publish a table' in empty state", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Click on the 'Publish a table' button in the empty state");
      H.DataStudio.Library.libraryPage()
        .findByRole("button", { name: "Publish a table" })
        .click();

      cy.log("Verify the publish table modal opens");
      H.entityPickerModal().should("be.visible");
      H.entityPickerModalItem(3, "Orders").should("exist");
    });

    it("should hide empty state when section has items", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Verify Data empty state is visible initially");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
        .should("be.visible");

      cy.log("Publish a table");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Publish a table").click();
      H.entityPickerModalItem(3, "Orders").click();
      H.entityPickerModal().button("Publish").click();

      cy.log("Navigate back to the library");
      H.DataStudio.breadcrumbs().findByRole("link", { name: "Data" }).click();

      cy.log("Verify Data empty state is hidden and table is visible");
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
        .should("not.exist");
    });

    it("should not show empty states in search results", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Search for 'Publish'");
      H.DataStudio.Library.libraryPage()
        .findByPlaceholderText("Search...")
        .type("Publish");

      cy.log("Verify empty state descriptions are not in search results");
      H.DataStudio.Library.libraryPage()
        .findByText("Cleaned, pre-transformed data sources ready for exploring")
        .should("not.exist");
    });

    it("should keep empty sections expanded when navigating back via breadcrumbs", () => {
      H.createLibrary();
      H.DataStudio.Library.visit();

      cy.log("Publish a table so Data section has content");
      H.DataStudio.Library.newButton().click();
      H.popover().findByText("Publish a table").click();
      H.entityPickerModalItem(3, "Orders").click();
      H.entityPickerModal().button("Publish").click();

      cy.log("Navigate back to Data section via breadcrumbs");
      H.DataStudio.breadcrumbs().findByRole("link", { name: "Data" }).click();

      cy.log(
        "Verify empty sections (Metrics, SQL snippets) are still expanded and showing empty states",
      );
      H.DataStudio.Library.libraryPage()
        .findByText("Standardized calculations with known dimensions")
        .should("be.visible");
      H.DataStudio.Library.libraryPage()
        .findByText("Reusable bits of code that save your time")
        .should("be.visible");

      cy.log("Verify the Data section table is also visible");
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
    });
  });
});
