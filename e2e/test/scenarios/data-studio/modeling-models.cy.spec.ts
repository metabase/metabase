const { H } = cy;
import { createLibraryWithItems } from "e2e/support/test-library-data";

describe("scenarios > data studio > modeling > models", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/collection").as("createCollection");
    cy.intercept("PUT", "/api/collection/*").as("updateCollection");
    cy.intercept("POST", "/api/dataset").as("dataset");

    createLibraryWithItems();
  });

  it("should edit model name and description", () => {
    cy.log("Navigate to Data Studio Modeling");
    cy.visit("/data-studio/modeling");

    cy.log("Select Models collection from sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Click on the model from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Trusted Orders Model").click();

    cy.log("Verify model overview page displays correct data");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .should("be.visible");

    cy.log("Update the model name");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .clear()
      .type("Updated Orders Model{enter}");

    cy.wait("@updateCard");

    cy.log("Verify updated name appears in overview");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Updated Orders Model")
      .should("be.visible");

    cy.log("Verify updated name appears in collection view");
    cy.visit("/data-studio/modeling");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    H.DataStudio.Modeling.modelItem("Updated Orders Model").should(
      "be.visible",
    );
  });

  it("should navigate between tabs", () => {
    cy.log("Navigate to Data Studio Modeling");
    cy.visit("/data-studio/modeling");

    cy.log("Select Models collection from sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Click on the model from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Trusted Orders Model").click();

    cy.log("Verify Overview tab displays model name");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .should("be.visible");

    cy.log("Navigate to Definition tab");
    H.DataStudio.Models.definitionTab().click();
    H.DataStudio.Models.queryEditor().findByText("Orders").should("be.visible");

    cy.log("Navigate to Fields tab");
    H.DataStudio.Models.fieldsTab().click();
    H.DataStudio.Models.fieldsPage().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("User ID").should("be.visible");
      cy.findByText("Product ID").should("be.visible");
    });

    cy.log("Navigate to Dependencies tab");
    H.DataStudio.Models.dependenciesTab().click();
    H.DependencyGraph.graph().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Trusted Orders Model").should("be.visible");
    });

    cy.log("Navigate back to Overview tab");
    H.DataStudio.Models.overviewTab().click();
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .should("be.visible");
  });

  it("should archive and restore a model", () => {
    cy.log("Navigate to Data Studio Modeling");
    cy.visit("/data-studio/modeling");

    cy.log("Select Models collection from sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Wait for collection page to load");
    H.DataStudio.Modeling.collectionPage().should("be.visible");

    cy.log("Click on the model from the collection view");
    cy.findByRole("table").findByText("Trusted Orders Model").click();

    cy.log("Verify model is loaded before archiving");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .should("be.visible");

    cy.log("Archive the model");
    H.DataStudio.Models.moreMenu().click();
    H.popover().findByText("Move to trash").click();

    cy.log("Confirm archiving in modal");
    H.modal().button("Move to trash").click();

    cy.wait("@updateCard");

    cy.log("Verify redirected to modeling page");
    cy.url().should("include", "/data-studio/modeling");

    cy.log("Verify model is removed from collection view");
    cy.visit("/data-studio/modeling");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    H.DataStudio.Modeling.collectionPage()
      .findByText("No models yet")
      .should("be.visible");

    cy.log("Navigate to trash");
    cy.visit("/trash");

    cy.log("Verify model appears in trash");
    cy.findByRole("table")
      .findByText("Trusted Orders Model")
      .should("be.visible");

    cy.log("Restore the model");
    cy.findByRole("table").findByText("Trusted Orders Model").click();
    cy.findByTestId("archive-banner").should("be.visible");
    cy.findByTestId("archive-banner").findByText("Restore").click();
    cy.wait("@updateCard");

    cy.log("Verify model is restored in collection view");
    cy.visit("/data-studio/modeling");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table")
      .findByText("Trusted Orders Model")
      .should("be.visible");
  });

  it("should view model in question view via more menu", () => {
    cy.log("Navigate to Data Studio Modeling");
    cy.visit("/data-studio/modeling");

    cy.log("Select Models collection from sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Click on the model from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Trusted Orders Model").click();

    cy.log("Verify model is loaded");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .should("be.visible");

    cy.log("Verify View link opens in new tab");
    H.DataStudio.Models.moreMenu().click();
    H.popover()
      .findByText("View")
      .closest("a")
      .should("have.attr", "target", "_blank")
      .should("have.attr", "href")
      .and("match", /\/model\/\d+/);
  });

  it.skip("should duplicate model via more menu", () => {
    cy.log("Navigate to Data Studio Modeling");
    cy.visit("/data-studio/modeling");

    cy.log("Select Models collection from sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Click on the model from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Trusted Orders Model").click();

    cy.log("Verify model is loaded");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .should("be.visible");

    cy.log("Open more menu and click Duplicate");
    H.DataStudio.Models.moreMenu().click();
    H.popover().findByText("Duplicate").click();

    cy.log("Save duplicate model");
    H.modal()
      .findByText('Duplicate "Trusted Orders Model"')
      .should("be.visible");
    H.modal()
      .findByLabelText("Name")
      .should("have.value", "Trusted Orders Model - Duplicate");
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModal().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Library").click();
      cy.findByText("Data").click();
      cy.button("Select this collection").click();
    });

    H.modal().button("Duplicate").click();

    cy.wait("@createCard");

    cy.log("Verify duplicate model is created");
    H.DataStudio.Models.overviewPage()
      .findByText("Trusted Orders Model - Duplicate")
      .should("be.visible");

    cy.log("Verify both models appear in collection view");
    cy.visit("/data-studio/modeling");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").within(() => {
      cy.findByText("Trusted Orders Model").should("be.visible");
      cy.findByText("Trusted Orders Model - Duplicate").should("be.visible");
    });
  });

  it("should move model to different collection via more menu", () => {
    cy.log("Navigate to Data Studio Modeling");
    cy.visit("/data-studio/modeling");

    cy.log("Select Models collection from sidebar");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();

    cy.log("Click on the model from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Trusted Orders Model").click();

    cy.log("Verify model is loaded");
    H.DataStudio.Models.overviewPage()
      .findByDisplayValue("Trusted Orders Model")
      .should("be.visible");

    cy.log("Open more menu and click Move");
    H.DataStudio.Models.moreMenu().click();
    H.popover().findByText("Move").click();

    cy.log("Select First collection as destination");
    H.entityPickerModal().findByText("First collection").click();
    H.entityPickerModal().button("Move").click();

    cy.wait("@updateCard");

    cy.log("Verify model is in First collection");
    cy.findByTestId("move-card-toast").findByText("First collection").click();

    cy.log("Verify model is no longer in Models collection");
    cy.visit("/data-studio/modeling");
    H.DataStudio.ModelingSidebar.collectionsTree().findByText("Data").click();
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    H.DataStudio.Modeling.collectionPage()
      .findByText("No models yet")
      .should("be.visible");
  });
});
