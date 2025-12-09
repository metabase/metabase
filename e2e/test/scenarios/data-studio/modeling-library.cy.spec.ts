const { H } = cy;

import {
  TRUSTED_ORDERS_METRIC,
  createLibraryWithItems,
  createLibraryWithTable,
} from "e2e/support/test-library-data";

describe("scenarios > data studio > modeling > library", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should create library via UI and verify collections", () => {
    cy.intercept("POST", "/api/ee/library").as("createLibrary");
    cy.intercept("GET", "/api/collection/tree*").as("getCollectionTree");

    cy.log("Navigate to Data Studio Modeling");
    cy.visit("/data-studio/modeling");

    cy.log("Click Library sidebar section to open modal");
    H.DataStudio.ModelingSidebar.root()
      .findByText("Library")
      .should("be.visible")
      .click();

    cy.log("Create library via modal");
    H.modal().within(() => {
      cy.findByText("Create your Library").should("be.visible");
      cy.findByText("Create my Library").click();
    });

    cy.wait("@createLibrary");
    cy.wait("@getCollectionTree");

    cy.log("Verify library collections appear in sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().within(() => {
      cy.findByText("Data").should("be.visible");
      cy.findByText("Metrics").should("be.visible");
    });

    cy.log("Verify tracking event is triggered");
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_library_created",
    });

    cy.log("Verify empty state shows on library root");
    H.DataStudio.Modeling.collectionPage().within(() => {
      cy.findByText("No tables or metrics yet").should("be.visible");
      cy.findByText(
        "Tables and metrics in this collection will appear here.",
      ).should("be.visible");
    });

    cy.log("Select Data collection and verify it's empty");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Verify No published tables yet message");
    H.DataStudio.Modeling.collectionPage().within(() => {
      cy.findByText("No published tables yet").should("be.visible");
    });
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
});
