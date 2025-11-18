import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { TableId } from "metabase-types/api";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, PreviewSection } = H.DataModel;

const { ALL_USERS_GROUP } = USER_GROUPS;
const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;
const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;

function visitDataStudioDataModel(
  options?: Parameters<typeof H.DataModel.visit>[0],
) {
  H.DataModel.visit({ ...options, basePath: "/data-studio/data" });
}

describe("scenarios > data studio > datamodel", () => {
  beforeEach(() => {
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
  });

  describe("Data loading", () => {
    it("should show 404 if database does not exist (metabase#14652)", () => {
      visitDataStudioDataModel({ databaseId: 54321, skipWaiting: true });
      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 0);
      H.DataModel.get().findByText("Not found.").should("be.visible");
      cy.location("pathname").should("eq", "/data-studio/data/database/54321");
    });

    it("should show 404 if table does not exist", () => {
      visitDataStudioDataModel({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: 12345,
        skipWaiting: true,
      });
      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 8);
      H.DataModel.get().findByText("Not found.").should("be.visible");
      cy.location("pathname").should(
        "eq",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/12345`,
      );
    });

    it("should show 404 if field does not exist", () => {
      visitDataStudioDataModel({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: 12345,
        skipWaiting: true,
      });
      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 8);
      H.DataModel.get().findByText("Not found.").should("be.visible");
      cy.location("pathname").should(
        "eq",
        `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/12345`,
      );
    });

    it(
      "should not show 404 error if database is not selected",
      { tags: ["@external"] },
      () => {
        H.restore("postgres-writable");
        H.resetTestTable({ type: "postgres", table: "multi_schema" });
        H.resyncDatabase({ dbId: WRITABLE_DB_ID });

        cy.log("database not selected");
        visitDataStudioDataModel();
        H.DataModel.get()
          .findByText(/Not found/)
          .should("not.exist");

        cy.log("database selected");
        TablePicker.getDatabase("Writable Postgres12").click();
        H.DataModel.get()
          .findByText(/Not found/)
          .should("not.exist");

        cy.log("schema selected");
        TablePicker.getSchema("Domestic").click();
        H.DataModel.get()
          .findByText(/Not found/)
          .should("not.exist");

        cy.log("table selected");
        TablePicker.getTable("Animals").click();
        H.DataModel.get()
          .findByText(/Not found/)
          .should("not.exist");
      },
    );
  });

  describe("Table picker", () => {
    describe("No databases", () => {
      beforeEach(() => {
        cy.request("DELETE", `/api/database/${SAMPLE_DB_ID}`);
      });

      it("should allow to navigate databases, schemas, and tables", () => {
        visitDataStudioDataModel();

        cy.get("main")
          .findByText("No connected databases")
          .should("be.visible");

        cy.findByRole("link", { name: "Connect a database" })
          .should("be.visible")
          .click();

        cy.location("pathname").should("eq", "/admin/databases/create");
        cy.findByRole("heading", { name: "Add a database" }).should(
          "be.visible",
        );
      });
    });

    describe("1 database, no schemas", () => {
      it("should allow to navigate tables", { tags: ["@external"] }, () => {
        H.restore("mysql-8");
        cy.signInAsAdmin();

        visitDataStudioDataModel();

        TablePicker.getDatabase("QA MySQL8").click();
        TablePicker.getTables().should("have.length", 4);
        TablePicker.getSchemas().should("have.length", 0);

        cy.location("pathname").should(
          "eq",
          `/data-studio/data/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`,
        );

        TablePicker.getTable("Products").click();
        TableSection.getNameInput().should("have.value", "Products");

        cy.location("pathname").should((pathname) => {
          return pathname.startsWith(
            `/data-studio/data/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}/table/`,
          );
        });
      });

      it("should allow searching for tables", { tags: ["@external"] }, () => {
        H.restore("mysql-8");
        cy.signInAsAdmin();

        visitDataStudioDataModel();

        TablePicker.getSearchInput().type("rEvIeWs");
        TablePicker.getTables().should("have.length", 2);

        TablePicker.getTables().eq(0).click();
        TableSection.getNameInput().should("have.value", "Reviews");

        cy.location("pathname").should((pathname) => {
          return pathname.startsWith(
            `/data-studio/data/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}/table/`,
          );
        });
      });

      it("should restore previously selected table when expanding the tree", () => {
        H.restore("mysql-8");
        cy.signInAsAdmin();

        visitDataStudioDataModel({
          databaseId: MYSQL_DB_ID,
          schemaId: MYSQL_DB_SCHEMA_ID,
        });

        TablePicker.getDatabase("QA MySQL8").click();
        cy.location("pathname").should(
          "eq",
          `/data-studio/data/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`,
        );

        TablePicker.getDatabase("QA MySQL8").click();
        cy.location("pathname").should(
          "eq",
          `/data-studio/data/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`,
        );

        cy.log("ensure navigation to another db works");
        TablePicker.getDatabase("Sample Database").click();
        TablePicker.getTables().should("have.length", 12);
      });
    });

    describe("1 database, 1 schema", () => {
      it("should allow to navigate databases, schemas, and tables", () => {
        visitDataStudioDataModel();

        cy.log("should auto-open the only schema in the only database");
        cy.location("pathname").should(
          "eq",
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}`,
        );

        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getDatabase("Sample Database").should("be.visible");
        TablePicker.getSchemas().should("have.length", 0);
        TablePicker.getTables().should("have.length", 8);
        TableSection.get().should("not.exist");
        TablePicker.getTable("Orders").should("be.visible").click();

        cy.location("pathname").should(
          "eq",
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );
        TableSection.get().should("be.visible");

        TablePicker.getTable("Products").should("be.visible").click();
        cy.location("pathname").should(
          "eq",
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PRODUCTS_ID}`,
        );
        TableSection.get().should("be.visible");
      });

      it("should allow to search for tables", () => {
        visitDataStudioDataModel();

        TablePicker.getSearchInput().type("or");
        TablePicker.getTables().should("have.length", 1);
        TablePicker.getTable("Orders").should("be.visible").click();
        cy.location("pathname").should(
          "eq",
          `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );
        TableSection.getNameInput().should("have.value", "Orders");

        cy.log("no results");
        TablePicker.getSearchInput().clear().type("xyz");
        TablePicker.get().findByText("No tables found").should("be.visible");

        cy.log("go back to browsing");
        TablePicker.getSearchInput().clear();
        TablePicker.getTables().should("have.length", 8);
      });
    });

    describe(
      "mutliple databases, with single and multiple schemas",
      { tags: "@external" },
      () => {
        beforeEach(() => {
          H.restore("postgres-writable");
          cy.signInAsAdmin();

          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });
        });

        it("should allow to navigate databases, schemas, and tables", () => {
          visitDataStudioDataModel();

          cy.location("pathname").should("eq", "/data-studio/data");
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 0);
          TablePicker.getTables().should("have.length", 0);
          TablePicker.getDatabase("Sample Database").should("be.visible");

          cy.log("open database");
          TablePicker.getDatabase("Writable Postgres12")
            .should("be.visible")
            .click();
          cy.location("pathname").should(
            "eq",
            `/data-studio/data/database/${WRITABLE_DB_ID}`,
          );
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 0);
          TablePicker.getSchema("Wild").should("be.visible");
          TablePicker.getSchema("Domestic").should("be.visible");

          cy.log("open schema");
          TablePicker.getSchema("Domestic").click();
          cy.location("pathname").should(
            "eq",
            `/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic`,
          );
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 1);
          TablePicker.getTable("Animals").should("be.visible");

          cy.log("open table");
          TablePicker.getTable("Animals").click();
          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
            );
          });
          TableSection.getNameInput().should("have.value", "Animals");

          cy.log("open another schema");
          TablePicker.getSchema("Wild").click();
          cy.log(
            "should not update URL to point to schema as we have a table open",
          );
          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
            );
          });

          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 3);
          TablePicker.getTable("Birds").should("be.visible");

          cy.log("open another table");
          TablePicker.getTable("Birds").click();
          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
            );
          });
          TableSection.getNameInput().should("have.value", "Birds");

          cy.log("close schema");
          TablePicker.getSchema("Wild").click();
          TablePicker.getSchema("Wild").click();
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 1);
          TablePicker.getTable("Birds").should("not.exist");

          cy.log("close database");
          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 0);
          TablePicker.getTables().should("have.length", 0);

          cy.log("we still have a table opened");
          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
            );
          });

          cy.log("databases, schemas, and tables should be links");
          TablePicker.getDatabase("Sample Database").click();
          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getDatabase("Writable Postgres12")
            .should("have.prop", "tagName", "A")
            .and(
              "have.attr",
              "href",
              `/data-studio/data/database/${WRITABLE_DB_ID}`,
            );
          TablePicker.getSchema("Domestic")
            .should("have.prop", "tagName", "A")
            .and(
              "have.attr",
              "href",
              `/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic`,
            );
          TablePicker.getTable("Orders")
            .should("have.prop", "tagName", "A")
            .and(
              "have.attr",
              "href",
              `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
            );
        });

        it("should allow to search for tables", () => {
          visitDataStudioDataModel();

          TablePicker.getSearchInput().type("b");
          TablePicker.getTables().should("have.length", 2);
          TablePicker.getTable("Bookmark Ordering").should("be.visible");
          TablePicker.getTable("Birds").should("be.visible");

          TablePicker.getSearchInput().clear().type("bi");
          TablePicker.getTables().should("have.length", 1);
          TablePicker.getTable("Birds").should("be.visible").click();

          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/`,
            );
          });
          TableSection.getNameInput().should("have.value", "Birds");

          cy.log("go back to browsing");
          TablePicker.getSearchInput().clear();
          TablePicker.getTables().should("have.length", 2);
        });

        it("should restore previously selected table when expanding the tree", () => {
          visitDataStudioDataModel();

          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getSchema("Domestic").click();
          TablePicker.getTable("Animals").click();
          TablePicker.getSchema("Wild").click();
          TablePicker.getTable("Birds").click();
          TablePicker.getTable("Birds").should(
            "have.attr",
            "aria-selected",
            "true",
          );
          TablePicker.getTable("Birds").find('input[type="checkbox"]').check();
          TablePicker.getTable("Birds").should(
            "not.have.attr",
            "aria-selected",
            "true",
          );

          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getDatabase("Writable Postgres12").click();

          TableSection.getNameInput().should("have.value", "Birds");
        });
      },
    );
  });

  describe("Table section", () => {
    it("should show all tables in sample database and fields in orders table", () => {
      visitDataStudioDataModel({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      TablePicker.getTables().should("have.length", 8);

      TableSection.clickField("ID");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "BIGINT");
      FieldSection.getSemanticTypeInput().should("have.value", "Entity Key");

      TableSection.clickField("User ID");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "INTEGER");
      FieldSection.getSemanticTypeInput().should("have.value", "Foreign Key");
      FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "People → ID",
      );

      TableSection.clickField("Tax");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "DOUBLE PRECISION");
      FieldSection.getSemanticTypeInput().should(
        "have.value",
        "No semantic type",
      );

      TableSection.clickField("Discount");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "DOUBLE PRECISION");
      FieldSection.getSemanticTypeInput().should("have.value", "Discount");

      TableSection.clickField("Created At");
      FieldSection.getDataType()
        .should("be.visible")
        .and("have.text", "TIMESTAMP");
      FieldSection.getSemanticTypeInput().should(
        "have.value",
        "Creation timestamp",
      );
    });

    it("should be able to preview the table in the query builder", () => {
      visitDataStudioDataModel({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
      TableSection.getQueryBuilderLink().click();
      H.queryBuilderHeader().findByText("Orders").should("be.visible");
    });

    it("should be able to see details of a table", () => {
      visitDataStudioDataModel({ databaseId: SAMPLE_DB_ID });

      verifyTableSectionEmptyState();

      TablePicker.getTable("Orders").click();
      verifyFieldSectionEmptyState();
      TableSection.getNameInput().should("have.value", "Orders");
      TableSection.getDescriptionInput().should(
        "have.value",
        "Confirmed Sample Company orders for a product, from a user.",
      );
    });

    it(
      "should be able to select and update a table in a database without schemas",
      { tags: ["@external"] },
      () => {
        H.restore("mysql-8");

        visitDataStudioDataModel({
          databaseId: MYSQL_DB_ID,
          schemaId: MYSQL_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getNameInput().clear().type("New orders").blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table name updated");
        TableSection.getNameInput().should("have.value", "New orders");
      },
    );

    it(
      "should show empty state when table has no fields",
      { tags: ["@external"] },
      () => {
        H.restore("postgres-writable");
        H.resetTestTable({ type: "postgres", table: "multi_schema" });
        H.queryWritableDB(
          'alter table "Domestic"."Animals" drop column Name, drop column Score',
        );
        H.resyncDatabase({ dbId: WRITABLE_DB_ID });

        visitDataStudioDataModel();
        TablePicker.getDatabase("Writable Postgres12").click();
        TablePicker.getSchema("Domestic").click();
        TablePicker.getTable("Animals").click();

        TableSection.get()
          .findByText("This table has no fields")
          .should("exist");
        TableSection.getSortButton().should("not.exist");
      },
    );

    describe("Name and description", () => {
      it("should allow changing the table name", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getNameInput().clear().type("New orders").blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table name updated");
        TableSection.getNameInput().should("have.value", "New orders");

        H.startNewQuestion();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("New orders").should("be.visible");
        });
      });

      it("should allow changing the table description", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getDescriptionInput()
          .clear()
          .type("New description")
          .blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table description updated");
        TableSection.getDescriptionInput().should(
          "have.value",
          "New description",
        );

        cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New description").should("be.visible");
      });

      // Skipped because data studio is not available with data model permissions only.
      // Unskip once the new datamodel page is available in that case.
      it.skip("should allow changing the table name with data model permissions only", () => {
        H.activateToken("pro-self-hosted");
        setDataModelPermissions({ tableIds: [ORDERS_ID] });

        cy.signIn("none");
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getNameInput().clear().type("New orders").blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table name updated");
        TableSection.getNameInput().should("have.value", "New orders");
        cy.signOut();

        cy.signInAsNormalUser();
        H.startNewQuestion();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("New orders").should("be.visible");
        });
      });

      it("should allow clearing the table description", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getDescriptionInput().clear().blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table description updated");
        TableSection.getDescriptionInput().should("have.value", "");

        cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No description yet").should("be.visible");
      });
    });

    describe("Field name and description", () => {
      it("should allow changing the field name", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getFieldNameInput("Tax").clear().type("New tax").blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Name of Tax updated");
        TableSection.getFieldNameInput("New tax").should("be.visible");

        cy.log("verify preview");
        TableSection.clickField("New tax");
        FieldSection.getPreviewButton().click();
        verifyTablePreview({
          column: "New tax",
          values: ["2.07", "6.1", "2.9", "6.01", "7.03"],
        });
        verifyObjectDetailPreview({ rowNumber: 4, row: ["New tax", "2.07"] });

        cy.log("verify viz");
        H.openOrdersTable();
        H.tableHeaderColumn("New tax").should("be.visible");
        H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
          "not.exist",
        );
      });

      // Skipped because data studio is not available with data model permissions only.
      // Unskip once the new datamodel page is available in that case.
      it.skip("should allow changing the field name with data model permissions only", () => {
        H.activateToken("pro-self-hosted");
        setDataModelPermissions({ tableIds: [ORDERS_ID] });
        cy.signIn("none");
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getFieldNameInput("Tax").clear().type("New tax").blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Name of Tax updated");
        TableSection.getFieldNameInput("New tax").should("be.visible");
        TableSection.getField("New tax").should("be.visible");

        cy.log("verify preview");
        TableSection.clickField("New tax");
        FieldSection.getPreviewButton().click();
        cy.wait("@dataset");
        PreviewSection.get()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");
        PreviewSection.getPreviewTypeInput().findByText("Detail").click();
        cy.wait("@dataset");
        PreviewSection.get()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");

        cy.log("verify viz as normal user");
        cy.signInAsNormalUser();
        H.openOrdersTable();
        H.tableHeaderColumn("New tax").should("be.visible");
        H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
          "not.exist",
        );
      });

      it("should allow changing the field description", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getFieldDescriptionInput("Total")
          .clear()
          .type("New description")
          .blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Description of Total updated");
        TableSection.getFieldDescriptionInput("Total").should(
          "have.value",
          "New description",
        );

        cy.log("verify preview");
        TableSection.clickField("Total");
        FieldSection.getPreviewButton().click();
        verifyTablePreview({
          column: "Total",
          description: "New description",
          values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
        });

        cy.visit(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
        );
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Total").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New description").should("be.visible");
      });

      it("should allow clearing the field description", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getFieldDescriptionInput("Total").clear().blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Description of Total updated");
        TableSection.getFieldDescriptionInput("Total").should("have.value", "");

        cy.log("verify preview");
        TableSection.clickField("Total");
        FieldSection.getPreviewButton().click();
        verifyTablePreview({
          column: "Total",
          values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
        });
        PreviewSection.get().findByTestId("header-cell").realHover();
        H.hovercard().should("not.contain.text", "The total billed amount.");

        cy.visit(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
        );
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Total").should("be.visible");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No description yet").should("be.visible");
      });
    });

    describe("Sorting", () => {
      it("should allow sorting fields as in the database", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");

        H.openProductsTable();
        H.assertTableData({
          columns: [
            "ID",
            "Ean",
            "Title",
            "Category",
            "Vendor",
            "Price",
            "Rating",
            "Created At",
          ],
        });
      });

      it("should allow sorting fields alphabetically", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByLabelText("Alphabetical order")
          .click();
        cy.wait("@updateTable");
        verifyAndCloseToast("Field order updated");
        TableSection.getSortOrderInput()
          .findByDisplayValue("alphabetical")
          .should("be.checked");

        H.openProductsTable();
        H.assertTableData({
          columns: [
            "Category",
            "Created At",
            "Ean",
            "ID",
            "Price",
            "Rating",
            "Title",
            "Vendor",
          ],
        });
      });

      it("should allow sorting fields smartly", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput().findByLabelText("Auto order").click();
        cy.wait("@updateTable");
        verifyAndCloseToast("Field order updated");
        TableSection.getSortOrderInput()
          .findByDisplayValue("smart")
          .should("be.checked");

        H.openProductsTable();
        H.assertTableData({
          columns: [
            "ID",
            "Created At",
            "Category",
            "Ean",
            "Price",
            "Rating",
            "Title",
            "Vendor",
          ],
        });
      });

      it("should allow sorting fields in the custom order", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");

        H.moveDnDKitElement(TableSection.getSortableField("ID"), {
          vertical: 50,
        });
        cy.wait("@updateFieldOrder");
        verifyAndCloseToast("Field order updated");

        cy.log(
          "should not show loading state after an update (metabase#56482)",
        );
        cy.findByTestId("loading-indicator", { timeout: 0 }).should(
          "not.exist",
        );

        TableSection.getSortOrderInput()
          .findByDisplayValue("custom")
          .should("be.checked");

        H.openProductsTable();
        H.assertTableData({
          columns: [
            "Ean",
            "ID",
            "Title",
            "Category",
            "Vendor",
            "Price",
            "Rating",
            "Created At",
          ],
        });
      });

      it("should allow switching to predefined order after drag & drop (metabase#56482)", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");

        H.moveDnDKitElement(TableSection.getSortableField("ID"), {
          vertical: 50,
        });
        cy.wait("@updateFieldOrder");
        verifyAndCloseToast("Field order updated");

        cy.log(
          "should not show loading state after an update (metabase#56482)",
        );
        cy.findByTestId("loading-indicator", { timeout: 0 }).should(
          "not.exist",
        );

        TableSection.getSortableFields().should(($items) => {
          expect($items[0].textContent).to.equal("Ean");
          expect($items[1].textContent).to.equal("ID");
        });

        TableSection.getSortOrderInput()
          .findByDisplayValue("custom")
          .should("be.checked");

        cy.log(
          "should allow switching to predefined order afterwards (metabase#56482)",
        );
        TableSection.getSortOrderInput()
          .findByLabelText("Database order")
          .click();
        cy.wait("@updateTable");

        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");
        TableSection.getSortableFields().should(($items) => {
          expect($items[0].textContent).to.equal("ID");
          expect($items[1].textContent).to.equal("Ean");
        });

        cy.log("should allow drag & drop afterwards (metabase#56482)"); // extra sanity check
        H.moveDnDKitElement(TableSection.getSortableField("ID"), {
          vertical: 50,
        });
        cy.wait("@updateFieldOrder");

        cy.log(
          "should not show loading state after an update (metabase#56482)",
        );
        cy.findByTestId("loading-indicator", { timeout: 0 }).should(
          "not.exist",
        );

        TableSection.getSortableFields().should(($items) => {
          expect($items[0].textContent).to.equal("Ean");
          expect($items[1].textContent).to.equal("ID");
        });
      });
    });

    describe("Sync options", () => {
      it("should allow to sync table schema, re-scan table, and discard cached field values", () => {
        visitDataStudioDataModel({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });
        TableSection.getSyncOptionsButton().click();

        cy.log("sync table schema");
        H.modal().within(() => {
          cy.button("Sync table schema").click();
          cy.button("Sync table schema").should("not.exist");
          cy.button("Sync triggered!").should("be.visible");
          cy.button("Sync triggered!").should("not.exist");
          cy.button("Sync table schema").should("be.visible");
        });

        cy.log("re-scan table");
        H.modal().within(() => {
          cy.button("Re-scan table").click();
          cy.button("Re-scan table").should("not.exist");
          cy.button("Scan triggered!").should("be.visible");
          cy.button("Scan triggered!").should("not.exist");
          cy.button("Re-scan table").should("be.visible");
        });

        cy.log("discard cached field values");
        H.modal().within(() => {
          cy.button("Discard cached field values").click();
          cy.button("Discard cached field values").should("not.exist");
          cy.button("Discard triggered!").should("be.visible");
          cy.button("Discard triggered!").should("not.exist");
          cy.button("Discard cached field values").should("be.visible");
        });

        cy.realPress("Escape");
        H.modal().should("not.exist");
      });
    });
  });
});

const setDataModelPermissions = ({
  tableIds = [],
}: {
  tableIds: TableId[];
}) => {
  const permissions = Object.fromEntries(tableIds.map((id) => [id, "all"]));

  // @ts-expect-error invalid cy.updatePermissionsGraph typing
  cy.updatePermissionsGraph({
    [ALL_USERS_GROUP]: {
      [SAMPLE_DB_ID]: {
        "data-model": {
          schemas: {
            PUBLIC: permissions,
          },
        },
      },
    },
  });
};

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}

function verifyTableSectionEmptyState() {
  H.DataModel.TableSection.get().should("not.exist");
}

function verifyFieldSectionEmptyState() {
  H.DataModel.FieldSection.get().should("not.exist");
}

function verifyTablePreview({
  column,
  description,
  values,
}: {
  column: string;
  description?: string;
  values: string[];
}) {
  PreviewSection.getPreviewTypeInput().findByText("Table").click();
  cy.wait("@dataset");

  PreviewSection.get().within(() => {
    H.assertTableData({
      columns: [column],
      firstRows: values.map((value) => [value]),
    });

    if (description != null) {
      cy.findByTestId("header-cell").realHover();
    }
  });

  if (description != null) {
    H.hovercard().should("contain.text", description);
  }
}

function verifyObjectDetailPreview({
  rowNumber,
  row,
}: {
  rowNumber: number;
  row: [string, string];
}) {
  const [label, value] = row;

  PreviewSection.getPreviewTypeInput().findByText("Detail").click();
  cy.wait("@dataset");

  cy.findAllByTestId("column-name").then(($els) => {
    const foundRowIndex = $els
      .toArray()
      .findIndex((el) => el.textContent?.trim() === label);

    expect(rowNumber).to.eq(foundRowIndex);

    cy.findAllByTestId("value")
      .should("have.length.gte", foundRowIndex)
      .eq(foundRowIndex)
      .should("contain", value);
  });
}
