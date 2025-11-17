const { H } = cy;

const { TablePicker } = H.DataModel;
const DATA_STUDIO_BASE_PATH = "/data-studio/data";
const visitAdminDataModel = H.DataModel.visit;

H.DataModel.visit = (options = {}) =>
  visitAdminDataModel({ ...options, basePath: DATA_STUDIO_BASE_PATH });

interface MetadataResponse {
  updated_at: string;
  data_layer: string;
  view_count: number;
}

interface PublishModelResponse {
  models: {
    id: number;
  }[];
}

describe("Table editing", () => {
  beforeEach(() => {
    H.restore("mysql-8");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/database?*").as("databases");
    cy.intercept("GET", "/api/database/*/schemas?*").as("schemas");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
    cy.intercept("GET", "/api/database/*/schema/*").as("schema");
    cy.intercept("POST", "/api/dataset*").as("dataset");
    cy.intercept("GET", "/api/field/*/values").as("fieldValues");
    cy.intercept("PUT", "/api/field/*", cy.spy().as("updateFieldSpy")).as(
      "updateField",
    );
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
    cy.intercept("POST", "/api/field/*/values").as("updateFieldValues");
    cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
    cy.intercept("PUT", "/api/table").as("updateTables");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
    cy.intercept("post", "/api/table/publish-model").as("publishModel");
  });

  it("should display metadata information", { tags: ["@external"] }, () => {
    H.DataModel.visit();
    TablePicker.getDatabase("QA MySQL8").click();
    TablePicker.getTable("Orders").click();

    cy.wait<MetadataResponse>("@metadata").then(({ response }) => {
      const updatedAt = response?.body.updated_at ?? "";
      const expectedDate = new Date(updatedAt).toLocaleString();
      const viewCount = response?.body.view_count ?? 0;

      cy.findByLabelText("Name on disk").should("have.text", "ORDERS");
      cy.findByLabelText("Last updated at").should("have.text", expectedDate);
      cy.findByLabelText("View count").should("have.text", viewCount);
      cy.findByLabelText("Est. row count").should("not.exist");
      cy.findByLabelText("Dependencies").should("have.text", "0");
      cy.findByLabelText("Dependents").should("have.text", "0");
    });
  });

  it(
    "should publish single table to a collection",
    { tags: ["@external"] },
    () => {
      H.DataModel.visit();
      TablePicker.getDatabase("QA MySQL8").click();
      TablePicker.getTable("Orders").click();

      // Shows publish model information modal
      cy.findByRole("button", { name: /Publish/ }).click();
      cy.findByRole("button", { name: /Got it/ }).click();
      H.modal().within(() => {
        cy.findByRole("button", { name: /Cancel/ }).click();
      });

      // Don't show this again, info should not be shown later
      cy.findByRole("button", { name: /Publish/ }).click();
      cy.findByLabelText("Don’t show this to me again").check();
      cy.findByRole("button", { name: /Got it/ }).click();
      H.modal().within(() => {
        cy.findByRole("button", { name: /Cancel/ }).click();
      });

      // Publish to a collection
      cy.findByRole("button", { name: /Publish/ }).click();
      H.pickEntity({
        tab: "Collections",
        path: ["Our analytics"],
      });
      cy.findByRole("button", { name: /Publish here/ }).click();

      // Feedback toast is correctly shown
      H.undoToast().within(() => {
        cy.findByText("Published").should("be.visible");
        cy.findByRole("button", { name: /See it/ }).click();
      });

      cy.wait<PublishModelResponse>("@publishModel").then(({ response }) => {
        const modelId = response?.body.models[0].id ?? 0;
        cy.url().should("include", `/data-studio/modeling/models/${modelId}`);
      });

      // Should not show info modal again after page reload
      cy.go("back");
      cy.reload();
      cy.findByRole("button", { name: /Publish/ }).click();
      H.modal().within(() => {
        cy.findByText("Pick the collection to publish this table in").should(
          "be.visible",
        );
      });
    },
  );
});
