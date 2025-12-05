import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createLibraryWithItems,
  createLibraryWithModel,
} from "e2e/support/test-library-data";

const { H } = cy;

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
      cy.button("Create my Library").click();
    });

    cy.wait("@createLibrary");
    cy.wait("@getCollectionTree");

    cy.log("Verify library collections appear in sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().within(() => {
      cy.findByText("Data").should("be.visible");
      cy.findByText("Metrics").should("be.visible");
    });

    cy.log("Verify empty state shows on library root");
    H.DataStudio.Modeling.collectionPage().within(() => {
      cy.findByText("No models or metrics yet").should("be.visible");
      cy.findByText(
        "Models and metrics in this collection will appear here.",
      ).should("be.visible");
    });

    cy.log("Select Data collection and verify it's empty");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Verify no models yet message");
    H.DataStudio.Modeling.collectionPage().within(() => {
      cy.findByText("No models yet").should("be.visible");
    });
  });

  it("should be available in the data picker", () => {
    createLibraryWithItems();

    H.startNewQuestion();
    H.miniPickerBrowseAll().click();

    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Data").click();
    H.entityPickerModalItem(2, "Trusted Orders Model").click();

    cy.log("Ensure that the we can build the path from a value");

    cy.button(/Trusted Orders Model/).click();
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
    H.entityPickerModalItem(2, "Trusted Orders Model").should(
      "have.attr",
      "data-active",
      "true",
    );
  });

  it("should let you move models and metrics into the library, even when empty", () => {
    H.createLibrary();

    H.visitModel(ORDERS_MODEL_ID);
    H.openQuestionActions("Duplicate");
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Metrics").should(
      "have.attr",
      "data-disabled",
      "true",
    );
    H.entityPickerModalItem(1, "Data").click();
    H.entityPickerModal().button("Select this collection").click();
    H.modal().button("Duplicate").click();
  });

  it("should show the library collection even if only 1 child collection has items", () => {
    createLibraryWithModel();

    H.startNewQuestion();
    H.miniPickerBrowseAll().click();

    H.entityPickerModalItem(0, "Library").click();
    H.entityPickerModalItem(1, "Data").click();
    H.entityPickerModalItem(2, "Trusted Orders Model").should("exist");
  });

  it("should be available in the question picker modal", () => {
    createLibraryWithItems();

    const library = () => H.entityPickerModalLevel(0).findByText("Library");

    cy.visit(
      `/admin/permissions/data/group/${ALL_USERS_GROUP_ID}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${SAMPLE_DATABASE.ACCOUNTS_ID}/segmented`,
    );

    H.modal()
      .findByText(/Use a saved question/)
      .click();
    H.modal()
      .button(/Select a question/)
      .click();

    H.entityPickerModal().within(() => {
      // Questions tab should not show the library, because the library can only contain models and metrics
      H.entityPickerModalTab("Questions").click();
      library().should("not.exist");
      H.entityPickerModalItem(0, "Our analytics").should("exist");

      // Question picker should show library in models tab
      H.entityPickerModalTab("Models").click();
      H.entityPickerModalItem(0, "Our analytics").should("exist");
      library().click();
      H.entityPickerModalItem(1, "Metrics").should(
        "have.attr",
        "data-disabled",
        "true",
      );
      H.entityPickerModalItem(1, "Data").click();
      H.entityPickerModalItem(2, "Trusted Orders Model").should("exist");
    });
  });
});
