import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;
const { TablePicker } = H.DataModel;

interface TablesActionRequest {
  database_ids: number[];
  schema_ids: number[];
  table_ids: number[];
}

interface TablesActionsResponse {
  status: string;
  message: string;
}

interface Table {
  display_name: string;
  id: number;
}

describe("bulk table operations", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    cy.intercept("POST", "/api/ee/data-studio/table/sync-schema").as(
      "syncSchema",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/rescan-values").as(
      "rescanValues",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/discard-values").as(
      "discardValues",
    );
    cy.intercept(
      "GET",
      `/api/database/${WRITABLE_DB_ID}/schema/public?include_hidden=true`,
    ).as("getSchema");
    cy.intercept("POST", "/api/ee/data-studio/table/publish-tables").as(
      "publishTables",
    );
    cy.intercept("POST", "/api/ee/data-studio/table/unpublish-tables").as(
      "unpublishTables",
    );
  });

  it("syncing multiple tables", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12").click();
    cy.wait("@getSchema").then(({ response }) => {
      const tables = response?.body ?? [];
      const accountTableId = getTableId(tables, "Orders");
      const feedbackTableId = getTableId(tables, "Products");

      cy.wrap([accountTableId, feedbackTableId]).as("tableIds");
    });

    TablePicker.getTable("Orders").find('input[type="checkbox"]').check();
    TablePicker.getTable("Products").find('input[type="checkbox"]').check();
    cy.findByRole("heading", { name: /2 tables selected/ });

    cy.findByRole("button", { name: /Sync settings/ }).click();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_bulk_sync_settings_clicked",
    });
    cy.findByRole("button", { name: /Sync table schemas/ }).click();
    cy.findByRole("button", { name: /Sync triggered!/ }).should("be.visible");
    cy.get<number[]>("@tableIds").then((tableIds) => {
      cy.wait<TablesActionRequest, TablesActionsResponse>("@syncSchema").then(
        ({ request, response }) => {
          expect(request.body.table_ids).to.deep.eq(tableIds);
          expect(response?.statusCode).to.eq(204);
        },
      );
    });
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_table_schema_sync_started",
      result: "success",
    });

    cy.findByRole("button", { name: /Re-scan tables/ }).click();
    cy.findByRole("button", { name: /Scan triggered!/ }).should("be.visible");

    cy.get<number[]>("@tableIds").then((tableIds) => {
      cy.wait<TablesActionRequest, TablesActionsResponse>("@rescanValues").then(
        ({ request, response }) => {
          expect(request.body.table_ids).to.deep.eq(tableIds);
          expect(response?.statusCode).to.eq(204);
        },
      );
    });
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_table_fields_rescan_started",
      result: "success",
    });

    cy.findByRole("button", { name: /Discard cached field values/ }).click();
    cy.findByRole("button", { name: /Discard triggered!/ }).should(
      "be.visible",
    );
    cy.get<number[]>("@tableIds").then((tableIds) => {
      cy.wait<TablesActionRequest, TablesActionsResponse>(
        "@discardValues",
      ).then(({ request, response }) => {
        expect(request.body.table_ids).to.deep.eq(tableIds);
        expect(response?.statusCode).to.eq(204);
      });
    });
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_table_field_values_discard_started",
      result: "success",
    });
  });

  it(
    "allows publishing and unpublishing multiple tables",
    { tags: ["@external"] },
    () => {
      H.restore("postgres-writable");
      H.activateToken("bleeding-edge");
      cy.signInAsAdmin();
      H.DataModel.visitDataStudio();

      cy.log("select multiple tables");
      TablePicker.getDatabase("Writable Postgres12").click();
      TablePicker.getTable("Orders").findByRole("checkbox").check();
      TablePicker.getTable("Products").findByRole("checkbox").check();
      TablePicker.getTable("Reviews").findByRole("checkbox").check();

      cy.log("publish the tables and verify they are published");
      cy.findByRole("button", { name: /Publish/ }).click();
      H.modal().findByText("Create my Library").click();
      H.modal().findByText("Publish these tables").click();
      cy.wait("@publishTables");
      H.undoToastListContainer().within(() => {
        cy.findByText("Published").should("be.visible");
        cy.findByRole("button", { name: /Go to Data/ }).click();
      });
      H.DataStudio.Library.tableItem("Orders").should("be.visible");
      H.DataStudio.Library.tableItem("Products").should("be.visible");
      cy.go("back");

      cy.log("unpublish some tables and verify they are unpublished");
      TablePicker.getTable("Orders").findByRole("checkbox").check();
      TablePicker.getTable("Products").findByRole("checkbox").check();
      cy.findByRole("button", { name: /Unpublish/ }).click();
      H.modal().findByText("Unpublish these tables").click();
      cy.wait("@unpublishTables");
      H.expectUnstructuredSnowplowEvent({
        event: "data_studio_table_unpublished",
      });
      H.DataStudio.nav().findByLabelText("Library").click();

      H.DataStudio.Library.libraryPage().within(() => {
        cy.findByText("Reviews").should("be.visible");
        cy.findByText("Orders").should("not.exist");
        cy.findByText("Products").should("not.exist");
      });
    },
  );

  it("allows to edit attributes for tables", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    cy.signInAsAdmin();
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12").click();
    TablePicker.getTable("Orders").find('input[type="checkbox"]').check();
    TablePicker.getTable("Products").find('input[type="checkbox"]').check();

    H.selectHasValue("Owner", "").click();
    H.selectDropdown().contains("Bobby Tables").click();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_bulk_attribute_updated",
      event_detail: "owner",
      result: "success",
    });

    H.selectHasValue("Visibility type", "").click();
    H.selectDropdown().contains("Gold").click();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_bulk_attribute_updated",
      event_detail: "layer",
      result: "success",
    });

    H.selectHasValue("Entity type", "").click();
    H.selectDropdown().contains("Person").click();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_bulk_attribute_updated",
      event_detail: "entity_type",
      result: "success",
    });

    H.selectHasValue("Source", "").click();
    H.selectDropdown().contains("Ingested").click();
    H.expectUnstructuredSnowplowEvent({
      event: "data_studio_bulk_attribute_updated",
      event_detail: "data_source",
      result: "success",
    });
    H.undoToastList().should("have.length", 4);
    TablePicker.getTable("Orders")
      .findByTestId("table-owner")
      .should("have.text", "Bobby Tables");
    TablePicker.getTable("Products")
      .findByTestId("table-owner")
      .should("have.text", "Bobby Tables");
  });

  describe(
    "several databases with several schemas at once (GDGT-1275)",
    { tags: ["@external"] },
    () => {
      beforeEach(() => {
        H.restore("postgres-writable");
        H.activateToken("bleeding-edge");
        H.createLibrary();
        cy.signInAsAdmin();
        H.resetTestTable({ type: "postgres", table: "multi_schema" });
        H.resyncDatabase({ dbId: WRITABLE_DB_ID });
        H.DataModel.visitDataStudio();
      });

      it("should change metadata and see that is changed for all selected tables without filters", () => {
        cy.log("change the owner and check the owner column");

        TablePicker.getDatabase("Writable Postgres12").click();
        TablePicker.getDatabase("Sample Database").click();
        TablePicker.getSchema("Domestic").click();
        TablePicker.getTable("Accounts").find('input[type="checkbox"]').check();
        TablePicker.getTable("Animals").find('input[type="checkbox"]').check();
        H.selectHasValue("Owner", "").click();
        H.selectDropdown().contains("Bobby Tables").click();

        ["Accounts", "Animals"].forEach((tableName) => {
          TablePicker.getTable(tableName)
            .findByTestId("table-owner")
            .should("have.text", "Bobby Tables");
        });

        cy.log("publish and check publish state column");

        TablePicker.getTable("Accounts")
          .find('input[type="checkbox"]')
          .scrollIntoView()
          .check();
        TablePicker.getTable("Animals").find('input[type="checkbox"]').check();
        cy.findByRole("button", { name: /Publish/ }).click();
        H.modal().findByText("Publish these tables").click();
        cy.wait("@publishTables");

        ["Accounts", "Animals"].forEach((tableName) => {
          TablePicker.getTable(tableName)
            .findByTestId("table-published")
            .findByLabelText("Published")
            .should("be.visible");
        });
      });

      it("should change metadata and see that is changed for all selected tables with filters", () => {
        TablePicker.getSearchInput().type("a");
        cy.log("change the owner and check the owner column");
        TablePicker.getTable("Accounts").find('input[type="checkbox"]').check();
        TablePicker.getTable("Animals").find('input[type="checkbox"]').check();
        H.selectHasValue("Owner", "").click();
        H.selectDropdown().contains("Bobby Tables").click();

        ["Accounts", "Animals"].forEach((tableName) => {
          TablePicker.getTable(tableName)
            .findByTestId("table-owner")
            .should("have.text", "Bobby Tables");
        });

        cy.log("publish and check publish state column");
        cy.findByRole("button", { name: /Publish/ }).click();
        H.modal().findByText("Publish these tables").click();
        cy.wait("@publishTables");

        ["Accounts", "Animals"].forEach((tableName) => {
          TablePicker.getTable(tableName)
            .findByTestId("table-published")
            .findByLabelText("Published")
            .should("be.visible");
        });
      });
    },
  );

  it("allows to edit attributes for db", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    H.createLibrary();
    cy.signInAsAdmin();
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12")
      .find('input[type="checkbox"]')
      .check();

    H.selectHasValue("Owner", "").click();
    H.selectDropdown().contains("Bobby Tables").click();

    H.selectHasValue("Visibility type", "").click();
    H.selectDropdown().contains("Gold").click();

    H.selectHasValue("Entity type", "").click();
    H.selectDropdown().contains("Person").click();

    H.selectHasValue("Source", "").click();
    H.selectDropdown().contains("Ingested").click();

    cy.findByRole("button", { name: /Publish/ }).click();
    H.modal().findByText("Publish these tables").click();
    cy.wait("@publishTables");

    TablePicker.getDatabase("Writable Postgres12").click();

    cy.findAllByTestId("tree-item")
      .filter('[data-type="table"]')
      .each((table) => {
        cy.wrap(table)
          .findByTestId("table-owner")
          .should("have.text", "Bobby Tables");
        cy.wrap(table)
          .findByTestId("table-published")
          .findByLabelText("Published")
          .should("be.visible");
      });
  });

  it("allows to edit attributes for schema", { tags: ["@external"] }, () => {
    H.restore("postgres-writable");
    H.activateToken("bleeding-edge");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "Animals" });
    H.DataModel.visitDataStudio();
    TablePicker.getDatabase("Writable Postgres12").click();
    TablePicker.getSchema("Schema A").find('input[type="checkbox"]').check();
    TablePicker.getSchema("Schema B").find('input[type="checkbox"]').check();

    cy.findByRole("heading", { name: /Multiple tables selected/ }).click();

    H.selectHasValue("Owner", "").click();
    H.selectDropdown().contains("Bobby Tables").click();

    H.selectHasValue("Visibility type", "").click();
    H.selectDropdown().contains("Gold").click();

    H.selectHasValue("Entity type", "").click();
    H.selectDropdown().contains("Person").click();

    H.selectHasValue("Source", "").click();
    H.selectDropdown().contains("Ingested").click();

    TablePicker.getSchema("Schema A").click();
    TablePicker.getSchema("Schema B").click();

    cy.findByTestId("loading-placeholder").should("not.exist");
    cy.findAllByTestId("tree-item")
      .filter('[data-type="table"]')
      .each((table) => {
        cy.wrap(table)
          .findByTestId("table-owner")
          .should("have.text", "Bobby Tables");
      });
  });
});

function getTableId(tables: Table[], tableName: string) {
  return tables.find((table: Table) => table.display_name === tableName)?.id;
}
