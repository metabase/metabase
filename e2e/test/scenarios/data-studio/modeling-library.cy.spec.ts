const { H } = cy;

const DATA_STUDIO_INDEX = 3;

describe("scenarios > data studio > modeling > library", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should create library via UI as admin and verify collections", () => {
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

  it("should allow non-admin users with data-studio permission to create library", () => {
    cy.intercept("POST", "/api/ee/library").as("createLibrary");
    cy.intercept("GET", "/api/collection/tree*").as("getCollectionTree");

    cy.log("Grant data-studio permission to All Users");
    cy.visit("/admin/permissions/application");
    H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
    cy.button("Save changes").click();
    H.modal().button("Yes").click();

    cy.log("Sign in as normal user");
    cy.signInAsNormalUser();

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
  });
});
