import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;
const { TablePicker } = H.DataModel;

interface MetadataResponse {
  updated_at: string;
  data_layer: string;
  view_count: number;
}

describe("Table editing", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
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
    cy.intercept("POST", "/api/ee/data-studio/table/publish-tables").as(
      "publishTables",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/unpublish-tables").as(
      "unpublishTables",
    );
  });

  it("should display metadata information", { tags: ["@external"] }, () => {
    H.restore("mysql-8");
    H.activateToken("bleeding-edge");
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("QA MySQL8").click();
    TablePicker.getTable("Orders").click();

    cy.wait<MetadataResponse>("@metadata").then(({ response }) => {
      const updatedAt = response?.body.updated_at ?? "";
      const expectedDate = new Date(updatedAt).toLocaleString();
      const viewCount = response?.body.view_count ?? 0;

      cy.findByLabelText("Name in the database").should("have.text", "ORDERS");
      cy.findByLabelText("Last updated at").should("have.text", expectedDate);
      cy.findByLabelText("View count").should("have.text", viewCount);
      cy.findByLabelText("Est. row count").should("not.exist");
      cy.findByLabelText("Dependencies").should("have.text", "0");
      cy.findByLabelText("Dependents").should("have.text", "0");

      H.DataModel.TableSection.get()
        .findByRole("link", { name: "Dependency graph" })
        .click();

      H.DataStudio.Dependencies.graph().should("be.visible");
    });
  });

  it(
    "should publish a single table to a collection and unpublish",
    { tags: ["@external"] },
    () => {
      H.restore("mysql-8");
      H.activateToken("bleeding-edge");
      H.DataModel.visitDataStudio();
      TablePicker.getDatabase("QA MySQL8").click();
      TablePicker.getTable("Orders").click();

      cy.log("publish the table and verify it's published");
      cy.findByRole("button", { name: /Publish/ }).click();
      H.modal().findByText("Create my Library").click();
      H.modal().findByText("Publish this table").click();
      cy.wait("@publishTables");
      H.undoToastListContainer().within(() => {
        cy.findByText("Published").should("be.visible");
        cy.findByRole("button", { name: /Go to Data/ }).click();
      });
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_table_published",
      });
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      cy.go("back");

      cy.log("unpublish the table and verify it's unpublished");
      cy.findByRole("button", { name: /Unpublish/ }).click();
      H.modal().findByText("Unpublish this table").click();
      cy.wait("@unpublishTables");
      H.DataStudio.nav().findByLabelText("Library").click();
      H.DataStudio.Library.allTableItems().should("have.length", 0);
    },
  );

  it("should allow to edit attributes", { tags: ["@external"] }, () => {
    H.restore("postgres-12");
    H.activateToken("bleeding-edge");
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("QA Postgres12").click();
    TablePicker.getTable("Orders").click();

    H.selectHasValue("Owner", "No owner").click();
    H.selectDropdown().contains("Bobby Tables").click();
    H.undoToastListContainer()
      .findByText("Table owner updated")
      .should("be.visible");

    H.selectHasValue("Visibility type", "Bronze").click();
    H.selectDropdown().contains("Gold").click();
    H.undoToastListContainer()
      .findByText("Table visibility type updated")
      .should("be.visible");

    H.selectHasValue("Entity type", "Transaction").click();
    H.selectDropdown().contains("Person").click();
    H.undoToastListContainer()
      .findByText("Entity type updated")
      .should("be.visible");

    H.selectHasValue("Source", "Unspecified").click();
    H.selectDropdown().contains("Ingested").click();
    H.undoToastListContainer()
      .findByText("Table data source updated")
      .should("be.visible");

    // navigate away and back
    TablePicker.getTable("Products").click();
    TablePicker.getTable("Orders").click();

    H.selectHasValue("Owner", "Bobby Tables");
    H.selectHasValue("Visibility type", "Gold");
    H.selectHasValue("Entity type", "Person");
    H.selectHasValue("Source", "Ingested");
  });

  it(
    "transform-created table should have link and disabled source edit",
    { tags: ["@external"] },
    () => {
      H.restore("postgres-writable");
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: "many_schemas" });

      const SOURCE_TABLE = "Animals";
      const TARGET_TABLE = "transform_table";
      const TARGET_SCHEMA = "Schema A";
      const TRANSFORM_TABLE_DISPLAY_NAME = "Transform Table";
      const TRANSFORM_NAME = "Test transform for animals";

      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

      // Create and run a transform to create a table
      H.createAndRunMbqlTransform({
        sourceTable: SOURCE_TABLE,
        targetTable: TARGET_TABLE,
        targetSchema: TARGET_SCHEMA,
        name: TRANSFORM_NAME,
      }).then(() => {
        H.DataModel.visitDataStudio();
        TablePicker.getDatabase("Writable Postgres12").click();
        TablePicker.getSchema(TARGET_SCHEMA).click();
        TablePicker.getTable(TRANSFORM_TABLE_DISPLAY_NAME).click();

        cy.findByRole("link", { name: new RegExp(TRANSFORM_NAME) }).should(
          "be.visible",
        );

        H.selectIsDisabled("Source");
      });
    },
  );
});
