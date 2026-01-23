import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { TableId } from "metabase-types/api";

const { H } = cy;
const {
  FEEDBACK,
  FEEDBACK_ID,
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  REVIEWS,
  REVIEWS_ID,
  PRODUCTS_ID,
} = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;
const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;
const { FieldSection, PreviewSection, TablePicker, TableSection } = H.DataModel;

const CUSTOM_MAPPING_ERROR =
  "You need unrestricted data access on this table to map custom display values.";

describe("scenarios > admin > datamodel", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

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

  it("should allow to navigate to a table when on a segments page (SEM-484)", () => {
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
    });

    cy.findByRole("link", { name: /Segments/ }).click();
    cy.location("pathname").should("eq", "/admin/datamodel/segments");
    cy.wait("@schema");

    H.DataModel.TablePicker.getTable("Reviews").click();
    H.DataModel.TableSection.getNameInput()
      .should("be.visible")
      .and("have.value", "Reviews");
    cy.location("pathname").should(
      "eq",
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${REVIEWS_ID}`,
    );
  });

  describe("Table picker", () => {
    describe("1 database, 1 schema", () => {
      it("should restore previously selected table when expanding the tree (SEM-435)", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TablePicker.getDatabase("Sample Database").click();
        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );

        TablePicker.getDatabase("Sample Database").click();
        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );
      });
    });

    describe(
      "mutliple databases, with single and multiple schemas",
      { tags: "@external" },
      () => {
        beforeEach(() => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });
        });

        it("should allow to search for tables", () => {
          H.DataModel.visit();

          TablePicker.getSearchInput().type("rd");
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 2);
          TablePicker.getTable("Orders").should("be.visible");
          TablePicker.getTable("Birds").should("be.visible");

          TablePicker.getSearchInput().clear().type("rds");
          TablePicker.getDatabases().should("have.length", 1);
          TablePicker.getSchemas().should("have.length", 1);
          TablePicker.getTables().should("have.length", 1);
          TablePicker.getTable("Birds").should("be.visible").click();

          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/`,
            );
          });
          TableSection.getNameInput().should("have.value", "Birds");

          cy.log("go back to browsing");
          TablePicker.getSearchInput().clear();
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getSchemas().should("have.length", 2);
          TablePicker.getTables().should("have.length", 2);
        });

        it("should restore previously selected table when expanding the tree (SEM-435)", () => {
          H.DataModel.visit();

          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getSchema("Domestic").click();
          TablePicker.getTable("Animals").click();
          TablePicker.getSchema("Wild").click();
          TablePicker.getTable("Birds").click();

          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getDatabase("Writable Postgres12").click();

          TableSection.getNameInput().should("have.value", "Birds");
          TablePicker.getTable("Birds").should(
            "have.attr",
            "aria-selected",
            "true",
          );
        });
      },
    );

    describe("Table visibility", () => {
      it("should allow changing the table visibility", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TablePicker.getTable("Orders").button("Hide table").click();
        cy.wait("@updateTable");

        verifyAndCloseToast("Hid Orders");

        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("Orders").should("not.exist");
        });

        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TablePicker.getTable("Orders").button("Unhide table").click();
        cy.wait("@updateTable");

        verifyAndCloseToast("Unhid Orders");

        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("Orders").should("be.visible");
        });
      });

      it("should allow hiding and restoring all tables in a single-schema database", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        verifyTablesHidden([
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
        ]);
        verifyTablesVisible(["Orders", "People", "Products", "Reviews"]);

        TablePicker.getDatabase("Sample Database")
          .button("Hide all tables")
          .click();
        cy.wait("@updateTables");

        verifyTablesHidden([
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);
        verifyToastAndUndo("Tables hidden");
        cy.wait("@updateTables");

        verifyTablesHidden([
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
        ]);
        verifyTablesVisible(["Orders", "People", "Products", "Reviews"]);

        TablePicker.getDatabase("Sample Database")
          .button("Hide all tables")
          .click();
        cy.wait("@updateTables");
        verifyAndCloseToast("Tables hidden");

        verifyTablesHidden([
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);

        TablePicker.getDatabase("Sample Database")
          .button("Unhide all tables")
          .click();
        cy.wait("@updateTables");
        verifyAndCloseToast("Tables unhidden");

        verifyTablesVisible([
          "Accounts",
          "Analytic Events",
          "Feedback",
          "Invoices",
          "Orders",
          "People",
          "Products",
          "Reviews",
        ]);
      });

      it(
        "should allow hiding and restoring all tables in a single-schema database",
        { tags: ["@external"] },
        () => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });

          H.DataModel.visit();

          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getDatabase("Writable Postgres12")
            .button("Hide all tables")
            .should("not.exist");
          TablePicker.getSchema("Domestic")
            .button("Hide all tables")
            .should("not.exist");
          TablePicker.getSchema("Wild")
            .button("Hide all tables")
            .should("not.exist");

          TablePicker.getSchema("Wild").click();
          TablePicker.getDatabase("Writable Postgres12")
            .button("Hide all tables")
            .should("not.exist");
          TablePicker.getSchema("Domestic")
            .button("Hide all tables")
            .should("not.exist");
          verifyTablesVisible(["Animals", "Birds"]);

          TablePicker.getSchema("Wild")
            .button("Hide all tables")
            .should("exist")
            .click();
          cy.wait("@updateTables");
          verifyTablesHidden(["Animals", "Birds"]);

          verifyToastAndUndo("Tables hidden");
          cy.wait("@updateTables");
          verifyTablesVisible(["Animals", "Birds"]);
        },
      );

      it(
        "should update the table picker state when toggling visibility of not currently selected branch",
        { tags: ["@external"] },
        () => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });

          H.DataModel.visit();

          TablePicker.getDatabase("Sample Database").click();
          TablePicker.getDatabase("Writable Postgres12").click();
          TablePicker.getSchema("Wild").click();
          TablePicker.getTable("Animals").click();

          TablePicker.getTable("Accounts")
            .button("Unhide table")
            .should("exist")
            .click();
          cy.wait("@updateTable");
          verifyTablesVisible(["Accounts"]);

          TablePicker.getDatabase("Sample Database")
            .button("Hide all tables")
            .should("exist")
            .click();
          cy.wait("@updateTables");
          verifyTablesHidden([
            "Accounts",
            "Analytic Events",
            "Feedback",
            "Invoices",
            "Orders",
            "People",
            "Products",
            "Reviews",
          ]);
        },
      );

      it("hidden table should not show up in various places in UI", () => {
        cy.signInAsAdmin();

        // Toggle the orders table to be hidden as admin user
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });
        TablePicker.getTable("Orders").button("Hide table").click();
        cy.wait("@updateTable");

        // Visit the main page, we shouldn't be able to see the table
        cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

        cy.findByTestId("browse-schemas")
          .findByText("Products")
          .should("be.visible");
        cy.findByTestId("browse-schemas")
          .findByText("Orders")
          .should("not.exist");

        // It shouldn't show up for a normal user either
        cy.signInAsNormalUser();
        cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

        cy.findByTestId("browse-schemas")
          .findByText("Products")
          .should("be.visible");
        cy.findByTestId("browse-schemas")
          .findByText("Orders")
          .should("not.exist");

        // It shouldn't show in a new question data picker
        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.contains("Products").should("exist");
          cy.contains("Orders").should("not.exist");
        });
      });

      describe("shouldn't prevent editing related question after turning table visibility off (metabase#15947)", () => {
        it("simple question (metabase#15947-1)", () => {
          turnTableVisibilityOff(ORDERS_ID);
          H.visitQuestion(ORDERS_QUESTION_ID);

          H.queryBuilderHeader().findByText("View-only").should("be.visible");
        });

        it("question with joins (metabase#15947-2)", { tags: "@skip" }, () => {
          H.createQuestion({
            name: "15947",
            query: {
              "source-table": ORDERS_ID,
              joins: [
                {
                  fields: "all",
                  "source-table": PRODUCTS_ID,
                  condition: [
                    "=",
                    ["field", ORDERS.PRODUCT_ID, null],
                    ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                  ],
                  alias: "Products",
                },
              ],
              filter: [
                "and",
                ["=", ["field", ORDERS.QUANTITY, null], 1],
                [
                  ">",
                  ["field", PRODUCTS.RATING, { "join-alias": "Products" }],
                  3,
                ],
              ],
              aggregation: [
                ["sum", ["field", ORDERS.TOTAL, null]],
                [
                  "sum",
                  ["field", PRODUCTS.RATING, { "join-alias": "Products" }],
                ],
              ],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
                ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
              ],
            },
          }).then(({ body: { id: QUESTION_ID } }) => {
            turnTableVisibilityOff(PRODUCTS_ID);
            cy.visit(`/question/${QUESTION_ID}/notebook`);
            cy.findByText("Products");
            cy.findByText("Quantity is equal to 1");
            cy.findByText("Rating is greater than 3");
            H.queryBuilderHeader().findByText("View-only").should("be.visible");
          });
        });
      });
    });
  });

  describe("Table section", () => {
    it(
      "should be able to select and update a table in a database without schemas",
      { tags: ["@external"] },
      () => {
        H.restore("mysql-8");

        H.DataModel.visit({
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

        H.DataModel.visit();
        TablePicker.getDatabase("Writable Postgres12").click();
        TablePicker.getSchema("Domestic").click();
        TablePicker.getTable("Animals").click();

        TableSection.get()
          .findByText("This table has no fields")
          .should("be.visible");
        TableSection.getSortButton().should("not.exist");
      },
    );

    describe("Name and description", () => {
      it("should allow changing the table name", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getNameInput().clear().type("New orders").blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table name updated");
        TableSection.getNameInput().should("have.value", "New orders");

        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("New orders").should("be.visible");
        });
      });

      it("should allow changing the table name with data model permissions only", () => {
        H.activateToken("pro-self-hosted");
        setDataModelPermissions({ tableIds: [ORDERS_ID] });

        cy.signIn("none");
        H.DataModel.visit({
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
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("People").should("be.visible");
          cy.findByText("New orders").should("be.visible");
        });
      });

      it("should allow changing the table description", () => {
        H.DataModel.visit({
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
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders").should("be.visible");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New description").should("be.visible");
      });

      it("should allow clearing the table description", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TableSection.getDescriptionInput().clear().blur();
        cy.wait("@updateTable");
        verifyAndCloseToast("Table description updated");
        TableSection.getDescriptionInput().should("have.value", "");

        cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders").should("be.visible");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No description yet").should("be.visible");
      });
    });

    describe("Field name and description", () => {
      it("should allow changing the field name", () => {
        H.DataModel.visit({
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

      it("should allow changing the field name with data model permissions only", () => {
        H.activateToken("pro-self-hosted");
        setDataModelPermissions({ tableIds: [ORDERS_ID] });
        cy.signIn("none");
        H.DataModel.visit({
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
        H.DataModel.visit({
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
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Total").should("be.visible");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New description").should("be.visible");
      });

      it("should allow clearing the field description", () => {
        H.DataModel.visit({
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
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Total").should("be.visible");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No description yet").should("be.visible");
      });
    });

    describe("Sorting", () => {
      it("should allow sorting fields as in the database", () => {
        H.DataModel.visit({
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
        H.DataModel.visit({
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
        H.DataModel.visit({
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
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");

        TableSection.getSortableField("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
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
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        TableSection.getSortButton().click();
        TableSection.getSortOrderInput()
          .findByDisplayValue("database")
          .should("be.checked");

        TableSection.getSortableField("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
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
        TableSection.getSortableField("ID").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
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
        H.DataModel.visit({
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

  describe("Field section", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("Name and description", () => {
      it("should allow changing the field name", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.TAX,
        });

        FieldSection.getNameInput().clear().type("New tax").blur();
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

      it("should allow changing the field name with data model permissions only", () => {
        H.activateToken("pro-self-hosted");
        setDataModelPermissions({ tableIds: [ORDERS_ID] });
        cy.signIn("none");
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.TOTAL,
        });

        FieldSection.getNameInput().clear().type("New total").blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Name of Total updated");
        FieldSection.getNameInput().should("have.value", "New total");
        TableSection.getFieldNameInput("New total")
          .scrollIntoView()
          .should("be.visible");

        cy.log("verify preview");
        TableSection.clickField("New total");
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
        H.tableHeaderColumn("New total").should("be.visible");
        H.tableHeaderColumn("Total", { scrollIntoView: false }).should(
          "not.exist",
        );
      });

      it("should allow changing the field description", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.TOTAL,
        });

        FieldSection.getDescriptionInput()
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
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Total").should("be.visible");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("New description").should("be.visible");
      });

      it("should allow clearing the field description", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.TOTAL,
        });

        FieldSection.getDescriptionInput().clear().blur();
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
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Total").should("be.visible");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No description yet").should("be.visible");
      });

      it("should remap FK display value from field section", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getNameInput()
          .clear()
          .type("Remapped Product ID")
          .realPress("Tab");
        cy.wait("@updateField");
        verifyAndCloseToast("Name of Product ID updated");

        cy.log("verify preview");
        FieldSection.getPreviewButton().click();
        verifyTablePreview({
          column: "Remapped Product ID",
          values: ["14", "123", "105", "94", "132"],
        });
        verifyObjectDetailPreview({
          rowNumber: 2,
          row: ["Remapped Product ID", "14"],
        });

        cy.log("verify viz");
        H.openOrdersTable({ limit: 5 });
        H.tableHeaderColumn("Remapped Product ID").should("be.visible");
      });
    });

    describe("Field values", () => {
      it("should allow to sync table schema, re-scan table, and discard cached field values", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
          fieldId: PRODUCTS.CATEGORY,
        });
        FieldSection.getFieldValuesButton().click();

        cy.log("re-scan field");
        H.modal().within(() => {
          cy.button("Re-scan field").click();
          cy.button("Re-scan field").should("not.exist");
          cy.button("Scan triggered!").should("be.visible");
          cy.button("Scan triggered!").should("not.exist");
          cy.button("Re-scan field").should("be.visible");
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

      it("should not automatically re-fetch field values when they are discarded unless 'Custom mapping' is used (metabase#62626)", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
          fieldId: PRODUCTS.CATEGORY,
        });

        FieldSection.getFieldValuesButton().click();
        H.modal().within(() => {
          cy.button("Discard cached field values").click();
          cy.button("Discard triggered!").should("be.visible");
          cy.button("Discard triggered!").should("not.exist");
        });

        cy.get("@fieldValues.all").should("have.length", 0);
      });
    });

    describe("Data", () => {
      describe("Coercion strategy", () => {
        it("should allow you to cast a field to a data type", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: FEEDBACK_ID,
            fieldId: FEEDBACK.RATING,
          });

          cy.log(
            "Ensure that Coercion strategy has been humanized (metabase#44723)",
          );
          FieldSection.getCoercionToggle().parent().scrollIntoView().click();
          H.popover().should("not.contain.text", "Coercion");
          H.popover().findByText("UNIX seconds → Datetime").click();
          cy.wait("@updateField");
          H.expectUnstructuredSnowplowEvent({
            event: "metadata_edited",
            event_detail: "type_casting",
            triggered_from: "admin",
          });
          verifyAndCloseToast("Casting enabled for Rating");

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Rating",
            values: [
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
            ],
          });
          verifyObjectDetailPreview({
            rowNumber: 4,
            row: ["Rating", "December 31, 1969, 4:00 PM"],
          });

          cy.log("verify viz");
          H.openTable({ database: SAMPLE_DB_ID, table: FEEDBACK_ID });
          cy.findAllByTestId("cell-data")
            .contains("December 31, 1969, 4:00 PM")
            .should("have.length.greaterThan", 0);
        });

        it("should allow to enable, change, and disable coercion strategy", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: FEEDBACK_ID,
            fieldId: FEEDBACK.RATING,
          });

          cy.log("show error when strategy not chosen after toggling");
          FieldSection.getCoercionToggle()
            .parent()
            .click({ scrollBehavior: "center" });
          clickAway();
          FieldSection.get()
            .findByText("To enable casting, please select a data type")
            .should("be.visible");

          cy.log("enable casting");
          FieldSection.getCoercionInput().click({ scrollBehavior: "center" });
          H.popover().findByText("UNIX nanoseconds → Datetime").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Casting enabled for Rating");

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          // ideally we should change the formatting to show smaller values and assert those
          // but we can't set formatting on a coerced field (metabase#60483)
          verifyTablePreview({
            column: "Rating",
            values: [
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
              "December 31, 1969, 4:00 PM",
            ],
          });
          verifyObjectDetailPreview({
            rowNumber: 4,
            row: ["Rating", "December 31, 1969, 4:00 PM"],
          });

          cy.log("change casting");
          FieldSection.getCoercionInput().click({ scrollBehavior: "center" });
          H.popover().findByText("UNIX seconds → Datetime").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Casting updated for Rating");

          cy.log("disable casting");
          FieldSection.getCoercionToggle()
            .parent()
            .click({ scrollBehavior: "center" });
          cy.wait("@updateField");
          verifyAndCloseToast("Casting disabled for Rating");

          cy.log("enable casting");
          FieldSection.getCoercionToggle()
            .parent()
            .click({ scrollBehavior: "center" });
          H.popover().findByText("UNIX seconds → Datetime").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Casting enabled for Rating");

          H.openTable({ database: SAMPLE_DB_ID, table: FEEDBACK_ID });
          cy.findAllByTestId("cell-data")
            .contains("December 31, 1969, 4:00 PM")
            .should("have.length.greaterThan", 0);
        });
      });
    });

    describe("Metadata", () => {
      describe("Semantic type", () => {
        it("should allow to change the type to 'No semantic type' (metabase#59052)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.PRODUCT_ID,
          });
          cy.wait(["@metadata", "@metadata"]);

          FieldSection.getSemanticTypeInput()
            .should("have.value", "Foreign Key")
            // it should allow to just type to search (metabase#59052)
            .type("no sema{downarrow}{enter}");
          cy.wait("@updateField");
          H.expectUnstructuredSnowplowEvent({
            event: "metadata_edited",
            event_detail: "semantic_type_change",
            triggered_from: "admin",
          });
          H.undoToast().should(
            "contain.text",
            "Semantic type of Product ID updated",
          );

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          cy.wait("@dataset");
          PreviewSection.get()
            .findAllByTestId("cell-data")
            .should("have.length", 6)
            .eq(1)
            // FKs get blueish background
            .should("have.css", "background-color", "rgba(0, 0, 0, 0)");

          cy.reload();
          cy.wait("@metadata");

          FieldSection.getSemanticTypeInput().should(
            "have.value",
            "No semantic type",
          );
        });

        it("should allow to change the type to 'Foreign Key' and choose the target field (metabase#59052)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          FieldSection.getSemanticTypeInput()
            .should("have.value", "Quantity")
            .click();
          H.popover().findByText("Foreign Key").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Semantic type of Quantity updated");

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          cy.wait("@dataset");
          PreviewSection.get()
            .findAllByTestId("cell-data")
            .should("have.length", 6)
            .eq(1)
            // FKs get blueish background
            .should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");

          FieldSection.getSemanticTypeFkTarget()
            .should("have.value", "")
            // it should allow to just type to search (metabase#59052)
            .type("products{downarrow}{enter}");
          cy.wait("@updateField");
          H.undoToast().should(
            "contain.text",
            "Semantic type of Quantity updated",
          );

          cy.log("verify preview");
          cy.wait("@dataset");
          PreviewSection.get()
            .findAllByTestId("cell-data")
            .should("have.length", 6)
            .eq(1)
            // FKs get blueish background
            .should("not.have.css", "background-color", "rgba(0, 0, 0, 0)");

          cy.reload();
          cy.wait(["@metadata", "@metadata"]);

          FieldSection.getSemanticTypeFkTarget()
            .should("be.visible")
            .and("have.value", "Products → ID");
        });

        it("should allow to change the foreign key target", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.USER_ID,
          });

          FieldSection.getSemanticTypeFkTarget()
            .should("have.value", "People → ID")
            .click();
          H.popover().within(() => {
            cy.findByText("Reviews → ID").should("be.visible");
            cy.findByText("Products → ID").click();
          });
          cy.wait("@updateField");
          H.undoToast().should(
            "contain.text",
            "Semantic type of User ID updated",
          );
          FieldSection.getSemanticTypeFkTarget().should(
            "have.value",
            "Products → ID",
          );

          H.openTable({
            database: SAMPLE_DB_ID,
            table: ORDERS_ID,
            mode: "notebook",
          });
          cy.icon("join_left_outer").click();
          H.miniPicker().within(() => {
            cy.findByText("Sample Database").click();
            cy.findByText("Products").click();
          });
          cy.findByLabelText("Left column").should("contain.text", "User ID");
        });

        it("should allow to change the field foreign key target with no permissions to Reviews table", () => {
          H.activateToken("pro-self-hosted");
          setDataModelPermissions({
            tableIds: [ORDERS_ID, PRODUCTS_ID, PEOPLE_ID],
          });

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.USER_ID,
          });
          FieldSection.getSemanticTypeFkTarget()
            .should("have.value", "People → ID")
            .click();
          H.popover().within(() => {
            cy.findByText("Reviews → ID").should("not.exist");
            cy.findByText("Products → ID").click();
          });
          cy.wait("@updateField");
          H.undoToast().should(
            "contain.text",
            "Semantic type of User ID updated",
          );
          FieldSection.getSemanticTypeFkTarget().should(
            "have.value",
            "Products → ID",
          );

          cy.log("verify preview");
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
          H.openTable({
            database: SAMPLE_DB_ID,
            table: ORDERS_ID,
            mode: "notebook",
          });
          cy.icon("join_left_outer").click();
          H.miniPicker().within(() => {
            cy.findByText("Sample Database").click();
            cy.findByText("Products").click();
          });
          cy.findByLabelText("Left column").should("contain.text", "User ID");
        });

        it("should not allow setting foreign key target for inaccessible tables", () => {
          H.activateToken("pro-self-hosted");
          setDataModelPermissions({ tableIds: [REVIEWS_ID] });

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.PRODUCT_ID,
          });
          FieldSection.getDisplayValuesInput().click();

          H.popover().within(() => {
            cy.findByRole("option", { name: /Use original value/ })
              .should("be.visible")
              .and("not.have.attr", "data-combobox-disabled");
            cy.findByRole("option", { name: /Use foreign key/ })
              .should("be.visible")
              .and("have.attr", "data-combobox-disabled", "true");
          });
        });

        it("should allow to change the type to 'Currency' and choose the currency (metabase#59052)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TAX,
          });

          FieldSection.getSemanticTypeInput()
            .should("have.value", "No semantic type")
            .click();
          H.popover().findByText("Currency").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Semantic type of Tax updated");

          cy.log("verify preview");
          TableSection.clickField("Tax");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Tax ($)",
            values: ["2.07", "6.10", "2.90", "6.01", "7.03"],
          });
          verifyObjectDetailPreview({
            rowNumber: 4,
            row: ["Tax ($)", "2.07"],
          });

          cy.log("change currency");
          FieldSection.getSemanticTypeCurrencyInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "US Dollar")
            // it should allow to just type to search (metabase#59052)
            .type("canadian{downarrow}{enter}");
          cy.wait("@updateField");
          verifyAndCloseToast("Semantic type of Tax updated");

          cy.log("verify preview");
          verifyTablePreview({
            column: "Tax (CA$)",
            values: ["2.07", "6.10", "2.90", "6.01", "7.03"],
          });
          verifyObjectDetailPreview({
            rowNumber: 4,
            row: ["Tax (CA$)", "2.07"],
          });

          cy.log("verify viz");
          H.openOrdersTable();
          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Tax (CA$)").should("be.visible");
        });

        it("should correctly filter out options in Foreign Key picker (metabase#56839)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.PRODUCT_ID,
          });
          cy.wait(["@metadata", "@metadata"]);

          FieldSection.getSemanticTypeFkTarget().focus().clear();
          H.popover()
            .should("contain.text", "Orders → ID")
            .and("contain.text", "People → ID")
            .and("contain.text", "Products → ID")
            .and("contain.text", "Reviews → ID");

          cy.log("should case-insensitive match field display name");
          FieldSection.getSemanticTypeFkTarget().focus().type("id");
          H.popover()
            .should("contain.text", "Orders → ID")
            .and("contain.text", "People → ID")
            .and("contain.text", "Products → ID")
            .and("contain.text", "Reviews → ID");

          cy.log("should case-insensitive match field description");
          FieldSection.getSemanticTypeFkTarget().focus().clear().type("EXT");
          H.popover()
            .should("not.contain.text", "Orders → ID")
            .and("not.contain.text", "People → ID")
            .and("contain.text", "Products → ID")
            .and("contain.text", "Reviews → ID");
        });

        it("should not let you change the type to 'Number' (metabase#16781)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.PRODUCT_ID,
          });
          cy.wait(["@metadata", "@metadata"]);

          FieldSection.getSemanticTypeInput().click();
          H.popover()
            .should("contain.text", "Foreign Key")
            .and("not.contain.text", "Number");
        });

        it("should not overflow the screen on smaller viewports (metabase#56442)", () => {
          const viewportHeight = 400;

          cy.viewport(1280, viewportHeight);
          H.DataModel.visit({ databaseId: SAMPLE_DB_ID });
          TablePicker.getTable("Reviews").scrollIntoView().click();
          TableSection.clickField("ID");
          FieldSection.getSemanticTypeInput().click();

          H.popover().scrollTo("top");
          H.popover()
            .findByText("Entity Key")
            .should(($element) => {
              const rect = $element[0].getBoundingClientRect();
              expect(rect.top).greaterThan(0);
            });

          H.popover().scrollTo("bottom");
          H.popover()
            .findByText("No semantic type")
            .should(($element) => {
              const rect = $element[0].getBoundingClientRect();
              expect(rect.bottom).lessThan(viewportHeight);
            });
        });

        it(
          "should show an error with links to other fields with 'Entity name' semantic type",
          { tags: "@external" },
          () => {
            H.restore("postgres-writable");
            H.resetTestTable({ type: "postgres", table: "many_data_types" });
            cy.signInAsAdmin();
            H.resyncDatabase({
              dbId: WRITABLE_DB_ID,
              tableName: "many_data_types",
            });

            H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
            TablePicker.getTable("Many Data Types").click();
            TableSection.clickField("Json → D");
            FieldSection.getSemanticTypeInput().click();
            H.popover().findByText("Entity Name").click();

            TableSection.clickField("Text");
            FieldSection.getSemanticTypeInput().click();
            H.popover().findByText("Entity Name").click();

            FieldSection.get().should(
              "contain.text",
              "There are other fields with this semantic type: Json: Json → D",
            );
            FieldSection.get()
              .findByRole("link", { name: "Json: Json → D" })
              .should("be.visible")
              .click();

            FieldSection.getNameInput().should("have.value", "Json → D");

            FieldSection.get().should(
              "contain.text",
              "There are other fields with this semantic type: Text",
            );
            FieldSection.get()
              .findByRole("link", { name: "Text" })
              .should("be.visible")
              .click();

            FieldSection.getNameInput().should("have.value", "Text");
          },
        );
      });
    });

    describe("Behavior", () => {
      describe("Visibility", () => {
        it("should let you change field visibility to 'Everywhere'", () => {
          cy.request("PUT", `/api/field/${ORDERS.TAX}`, {
            visibility_type: "sensitive",
          });
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TAX,
          });

          FieldSection.getVisibilityInput()
            .should("have.value", "Do not include")
            .click();
          H.popover().findByText("Everywhere").click();
          cy.wait("@updateField");
          H.expectUnstructuredSnowplowEvent({
            event: "metadata_edited",
            event_detail: "visibility_change",
            triggered_from: "admin",
          });
          verifyAndCloseToast("Visibility of Tax updated");
          FieldSection.getVisibilityInput().should("have.value", "Everywhere");

          cy.log("verify preview");
          TableSection.clickField("Tax");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Tax",
            values: ["2.07", "6.1", "2.9", "6.01", "7.03"],
          });
          verifyObjectDetailPreview({
            rowNumber: 4,
            row: ["Tax", "2.07"],
          });

          cy.log("table viz");
          H.openOrdersTable();
          H.tableHeaderColumn("Total").should("be.visible");
          H.tableHeaderColumn("Tax").should("be.visible");

          cy.log("object detail viz");
          cy.findByTestId("table-body")
            .findAllByTestId("cell-data")
            .eq(0)
            .click();
          H.modal().findByText("Tax").should("be.visible");
          H.modal().findByText("2.07").should("be.visible");
        });

        it("should let you change field visibility to 'Do not include'", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TAX,
          });

          FieldSection.getVisibilityInput()
            .should("have.value", "Everywhere")
            .click();
          H.popover().findByText("Do not include").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Visibility of Tax updated");
          FieldSection.getVisibilityInput().should(
            "have.value",
            "Do not include",
          );

          cy.log("verify preview");
          TableSection.clickField("Tax");
          FieldSection.getPreviewButton().click();
          PreviewSection.get()
            .findByText("This field is hidden")
            .should("be.visible");
          cy.get("@dataset.all").should("have.length", 0);
          PreviewSection.getPreviewTypeInput().findByText("Detail").click();
          cy.wait("@dataset");
          PreviewSection.get().findByText("Tax").should("not.exist");

          cy.log("table viz");
          H.openOrdersTable();
          H.tableHeaderColumn("Total").should("be.visible");
          H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
            "not.exist",
          );

          cy.log("object detail viz");
          cy.findByTestId("table-body")
            .findAllByTestId("cell-data")
            .eq(0)
            .click();
          H.modal().findByText("Tax").should("not.exist");
          H.modal().findByText("2.07").should("not.exist");
        });

        it("should let you change field visibility to 'Do not include' even if Preview is opened (metabase#61806)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TAX,
          });

          TableSection.clickField("Tax");
          FieldSection.getPreviewButton().click();
          PreviewSection.get().within(() => {
            cy.findByText("Filtering").click();

            cy.findByTestId("number-filter-picker").should("be.visible");
          });

          FieldSection.getVisibilityInput()
            .should("have.value", "Everywhere")
            .click();
          H.popover().findByText("Do not include").click();
          cy.wait("@updateField");

          PreviewSection.get()
            .findByText("This field is hidden")
            .should("be.visible");
        });

        it("should let you change field visibility to 'Only in detail views'", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TAX,
          });

          FieldSection.getVisibilityInput()
            .should("have.value", "Everywhere")
            .click();
          H.popover().findByText("Only in detail views").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Visibility of Tax updated");
          FieldSection.getVisibilityInput().should(
            "have.value",
            "Only in detail views",
          );

          cy.log("verify preview");
          TableSection.clickField("Tax");
          FieldSection.getPreviewButton().click();
          PreviewSection.get()
            .findByText("This field is hidden")
            .should("be.visible");
          cy.get("@dataset.all").should("have.length", 0);
          verifyObjectDetailPreview({
            rowNumber: 4,
            row: ["Tax", "2.07"],
          });

          cy.log("table viz");
          H.openOrdersTable();
          H.tableHeaderColumn("Total").should("be.visible");
          H.tableHeaderColumn("Tax", { scrollIntoView: false }).should(
            "not.exist",
          );

          cy.log("object detail viz");
          cy.findByTestId("table-body")
            .findAllByTestId("cell-data")
            .eq(0)
            .click();
          H.modal().findByText("Tax").should("be.visible");
          H.modal().findByText("2.07").should("be.visible");
        });

        it(
          "should be able to select and update a field in a database without schemas",
          { tags: ["@external"] },
          () => {
            H.restore("mysql-8");
            H.DataModel.visit({
              databaseId: MYSQL_DB_ID,
              schemaId: MYSQL_DB_SCHEMA_ID,
              tableId: ORDERS_ID,
            });

            TableSection.clickField("Tax");
            FieldSection.getVisibilityInput().click();
            H.popover().findByText("Do not include").click();
            cy.wait("@updateField");
            verifyAndCloseToast("Visibility of Tax updated");
            FieldSection.getVisibilityInput().should(
              "have.value",
              "Do not include",
            );
          },
        );
      });

      describe("Filtering", () => {
        it("should let you change filtering to 'Search box'", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          FieldSection.getFilteringInput()
            .should("have.value", "A list of all values")
            .click();
          H.popover().findByText("Search box").click();
          cy.wait("@updateField");
          H.expectUnstructuredSnowplowEvent({
            event: "metadata_edited",
            event_detail: "filtering_change",
            triggered_from: "admin",
          });
          verifyAndCloseToast("Filtering of Quantity updated");

          cy.log("verify preview");
          TableSection.clickField("Quantity");
          FieldSection.getPreviewButton().click();
          PreviewSection.getPreviewTypeInput().findByText("Filtering").click();
          PreviewSection.get().within(() => {
            cy.findByPlaceholderText("Enter a number").should("be.visible");
            cy.button(/Add filter/).should("not.exist");
          });

          cy.reload();
          FieldSection.getFilteringInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "Search box");
        });

        it("should let you change filtering to 'Plain input box'", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          FieldSection.getFilteringInput()
            .should("have.value", "A list of all values")
            .click();
          H.popover().findByText("Plain input box").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Filtering of Quantity updated");

          cy.log("verify preview");
          TableSection.clickField("Quantity");
          FieldSection.getPreviewButton().click();
          PreviewSection.getPreviewTypeInput().findByText("Filtering").click();
          PreviewSection.get().within(() => {
            cy.findByPlaceholderText("Min").should("be.visible");
            cy.findByPlaceholderText("Max").should("be.visible");
            cy.button(/Add filter/).should("not.exist");
          });

          cy.reload();
          FieldSection.getFilteringInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "Plain input box");
        });

        it("should let you change filtering to 'A list of all values'", () => {
          cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
            has_field_values: "none",
          });
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.QUANTITY,
          });

          FieldSection.getFilteringInput()
            .should("have.value", "Plain input box")
            .click();
          H.popover().findByText("A list of all values").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Filtering of Quantity updated");

          cy.log("verify preview");
          TableSection.clickField("Quantity");
          FieldSection.getPreviewButton().click();
          PreviewSection.getPreviewTypeInput().findByText("Filtering").click();
          PreviewSection.get().within(() => {
            cy.findByPlaceholderText("Search the list").should("be.visible");
            cy.button(/Add filter/).should("not.exist");
          });

          cy.reload();
          FieldSection.getFilteringInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "A list of all values");
        });
      });

      describe("Display values", () => {
        it("should show tooltips explaining why remapping options are disabled", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: PRODUCTS_ID,
            fieldId: PRODUCTS.TITLE,
          });

          FieldSection.getDisplayValuesInput().click();

          cy.log("foreign key mapping");
          H.popover().within(() => {
            cy.findByRole("option", { name: /Use foreign key/ }).should(
              "have.attr",
              "data-combobox-disabled",
              "true",
            );
            cy.findByRole("option", { name: /Use foreign key/ })
              .icon("info")
              .realHover();
          });
          H.tooltip().should(
            "contain.text",
            'You can only use foreign key mapping for fields with the semantic type set to "Foreign Key"',
          );

          cy.log("custom mapping");
          H.popover().within(() => {
            cy.findByRole("option", { name: /Custom mapping/ }).should(
              "have.attr",
              "data-combobox-disabled",
              "true",
            );
            cy.findByRole("option", { name: /Custom mapping/ })
              .icon("info")
              .realHover();
          });
          H.tooltip().should(
            "contain.text",
            'You can only use custom mapping for numerical fields with filtering set to "A list of all values"',
          );

          cy.log("clicking disabled option does not change the value");
          cy.findByRole("option", { name: /Custom mapping/ }).click({
            force: true, // try to click it despite pointer-events: none
          });
          FieldSection.getDisplayValuesInput().should(
            "have.value",
            "Use original value",
          );
        });

        it("should let you change to 'Use foreign key' and change the target for field with fk", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.PRODUCT_ID,
          });

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Product ID",
            values: ["14", "123", "105", "94", "132"],
          });
          verifyObjectDetailPreview({
            rowNumber: 2,
            row: ["Product ID", "14"],
          });

          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Use foreign key").click();
          H.popover().findByText("Title").click();
          cy.wait("@updateFieldDimension");
          H.expectUnstructuredSnowplowEvent({
            event: "metadata_edited",
            event_detail: "display_values",
            triggered_from: "admin",
          });
          H.undoToast().should(
            "contain.text",
            "Display values of Product ID updated",
          );

          cy.log("verify preview");
          verifyObjectDetailPreview({
            rowNumber: 2,
            row: ["Product ID", "Awesome Concrete Shoes"],
          });
          verifyTablePreview({
            column: "Product ID",
            values: [
              "Awesome Concrete Shoes",
              "Mediocre Wooden Bench",
              "Fantastic Wool Shirt",
              "Awesome Bronze Plate",
              "Sleek Steel Table",
            ],
          });

          cy.reload();
          FieldSection.getDisplayValuesInput()
            .scrollIntoView()
            .should("be.visible")
            .and("have.value", "Use foreign key");
          FieldSection.getDisplayValuesFkTargetInput()
            .should("be.visible")
            .and("have.value", "Title");
        });

        it("should allow to change foreign key target for accessible tables", () => {
          H.activateToken("pro-self-hosted");
          setDataModelPermissions({
            tableIds: [ORDERS_ID, REVIEWS_ID, PRODUCTS_ID],
          });

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.PRODUCT_ID,
          });

          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Use foreign key").click();
          H.popover().findByText("Title").click();
          cy.wait("@updateFieldDimension");
          H.undoToast().should(
            "contain.text",
            "Display values of Product ID updated",
          );

          cy.signInAsNormalUser();
          H.openReviewsTable({ limit: 1 });
          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Rustic Paper Wallet").should("be.visible");
        });

        it("should allow 'Custom mapping' null values", () => {
          const remappedNullValue = "nothin";

          cy.signInAsAdmin();
          H.addSqliteDatabase();

          cy.get<number>("@sqliteID").then((databaseId) => {
            H.withDatabase(
              databaseId,
              ({ NUMBER_WITH_NULLS: { NUM }, NUMBER_WITH_NULLS_ID }) => {
                cy.request("GET", `/api/database/${databaseId}/schemas`).then(
                  ({ body }) => {
                    const [schemaName] = body;

                    H.DataModel.visit({
                      databaseId,
                      schemaId: `${databaseId}:${schemaName}`,
                      tableId: NUMBER_WITH_NULLS_ID,
                      fieldId: NUM,
                    });
                  },
                );

                cy.log("Change `null` to custom mapping");
                FieldSection.getDisplayValuesInput().scrollIntoView().click();
                H.popover().findByText("Custom mapping").click();
                cy.wait("@updateFieldValues");
                H.expectUnstructuredSnowplowEvent({
                  event: "metadata_edited",
                  event_detail: "display_values",
                  triggered_from: "admin",
                });
                H.undoToast().should(
                  "contain.text",
                  "Display values of Num updated",
                );
                H.undoToast().icon("close").click({
                  force: true, // it's behind a modal
                });

                H.modal()
                  .should("be.visible")
                  .within(() => {
                    cy.findAllByPlaceholderText("Enter value")
                      .filter("[value='null']")
                      .clear()
                      .type(remappedNullValue);
                    cy.button("Save").click();
                  });
                cy.wait("@updateFieldValues");
                H.undoToast().should(
                  "contain.text",
                  "Display values of Num updated",
                );

                cy.log("Make sure custom mapping appears in QB");
                H.openTable({
                  database: databaseId,
                  table: NUMBER_WITH_NULLS_ID,
                });
                cy.findAllByRole("gridcell", {
                  name: remappedNullValue,
                }).should("be.visible");
              },
            );
          });
        });

        it("should correctly show remapped column value", () => {
          H.DataModel.visit({ databaseId: SAMPLE_DB_ID });

          // edit "Product ID" column in "Orders" table
          TablePicker.getTable("Orders").click();
          TableSection.clickField("Product ID");

          // remap its original value to use foreign key
          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Use foreign key").click();
          H.popover().findByText("Title").click();
          cy.wait("@updateFieldDimension");
          H.undoToast().should(
            "contain.text",
            "Display values of Product ID updated",
          );

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          verifyObjectDetailPreview({
            rowNumber: 2,
            row: ["Product ID", "Awesome Concrete Shoes"],
          });
          verifyTablePreview({
            column: "Product ID",
            values: [
              "Awesome Concrete Shoes",
              "Mediocre Wooden Bench",
              "Fantastic Wool Shirt",
              "Awesome Bronze Plate",
              "Sleek Steel Table",
            ],
          });

          FieldSection.get()
            .findByText(
              "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
            )
            .scrollIntoView()
            .should("be.visible");

          cy.log("Name of the product should be displayed instead of its ID");
          H.openOrdersTable();
          cy.findByRole("gridcell", { name: "Awesome Concrete Shoes" }).should(
            "be.visible",
          );
        });

        it("should correctly apply and display custom remapping for numeric values", () => {
          // this test also indirectly reproduces metabase#12771
          const customMap = {
            1: "Awful",
            2: "Unpleasant",
            3: "Meh",
            4: "Enjoyable",
            5: "Perfecto",
          };

          H.DataModel.visit({ databaseId: SAMPLE_DB_ID });
          // edit "Rating" values in "Reviews" table
          TablePicker.getTable("Reviews").click();
          TableSection.clickField("Rating");

          // apply custom remapping for "Rating" values 1-5
          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Custom mapping").click();
          cy.wait("@updateFieldValues");
          H.undoToast().should(
            "contain.text",
            "Display values of Rating updated",
          );
          H.undoToast().icon("close").click({
            force: true, // it's behind a modal
          });
          H.modal().within(() => {
            cy.findByText(
              "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
            ).should("be.visible");

            Object.entries(customMap).forEach(([key, value]) => {
              cy.findByDisplayValue(key).click().clear().type(value);
            });

            cy.button("Save").click();
          });
          cy.wait("@updateFieldValues");
          cy.wait("@updateFieldDimension");
          H.undoToast().should(
            "contain.text",
            "Display values of Rating updated",
          );

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Rating",
            values: [
              "Perfecto",
              "Enjoyable",
              "Perfecto",
              "Enjoyable",
              "Perfecto",
            ],
          });
          verifyObjectDetailPreview({
            rowNumber: 3,
            row: ["Rating", "Perfecto"],
          });

          cy.log("Numeric ratings should be remapped to custom strings");
          H.openReviewsTable();
          Object.values(customMap).forEach((rating) => {
            cy.findAllByText(rating)
              .eq(0)
              .scrollIntoView()
              .should("be.visible");
          });
        });

        it("should show a proper error message when using custom mapping", () => {
          H.activateToken("pro-self-hosted");
          setDataModelPermissions({ tableIds: [REVIEWS_ID] });

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });
          FieldSection.getDisplayValuesInput().click();

          H.popover().within(() => {
            cy.findByRole("option", { name: /Use original value/ })
              .should("be.visible")
              .and("not.have.attr", "data-combobox-disabled");
            cy.findByRole("option", { name: /Custom mapping/ })
              .should("be.visible")
              .and("have.attr", "data-combobox-disabled", "true");
          });

          cy.signInAsAdmin();
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });
          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Custom mapping").click();
          cy.wait("@updateFieldDimension");
          H.undoToast().should(
            "contain.text",
            "Display values of Rating updated",
          );

          cy.signIn("none");
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });

          // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
          cy.findByText(CUSTOM_MAPPING_ERROR).should("exist");
        });

        it("should allow 'Custom mapping' option only for 'Search box' filtering type (metabase#16322)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });

          FieldSection.getFilteringInput().click();
          H.popover().findByText("Search box").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Filtering of Rating updated");

          FieldSection.getDisplayValuesInput().click();
          H.popover()
            .findByRole("option", { name: /Custom mapping/ })
            .should("have.attr", "data-combobox-disabled", "true");
          H.popover()
            .findByRole("option", { name: /Custom mapping/ })
            .icon("info")
            .realHover();
          H.tooltip()
            .should("be.visible")
            .and(
              "have.text",
              'You can only use custom mapping for numerical fields with filtering set to "A list of all values"',
            );

          cy.log("close popover by clicking on element inside panel");
          FieldSection.get().findByText("Field settings").click();

          cy.log("open popover");
          FieldSection.getFilteringInput().click();
          H.popover().findByText("A list of all values").click();
          cy.wait("@updateField");
          verifyAndCloseToast("Filtering of Rating updated");

          FieldSection.getDisplayValuesInput().click();
          H.popover()
            .findByRole("option", { name: /Custom mapping/ })
            .should("not.have.attr", "data-combobox-disabled");
        });

        it("should allow to map FK to date fields (metabase#7108)", () => {
          H.DataModel.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.USER_ID,
          });

          FieldSection.getDisplayValuesInput().click();
          H.popover().findByText("Use foreign key").click();
          cy.wait("@updateFieldDimension");
          verifyAndCloseToast("Display values of User ID updated");

          FieldSection.getDisplayValuesFkTargetInput().click();

          H.popover().within(() => {
            cy.findByText("Birth Date").scrollIntoView().should("be.visible");
            cy.findByText("Created At")
              .scrollIntoView()
              .should("be.visible")
              .click();
          });
          cy.wait("@updateFieldDimension");
          H.undoToast().should(
            "contain.text",
            "Display values of User ID updated",
          );

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "User ID",
            values: [
              "2023-10-07T01:34:35.462-07:00",
              "2023-10-07T01:34:35.462-07:00",
              "2023-10-07T01:34:35.462-07:00",
              "2023-10-07T01:34:35.462-07:00",
              "2023-10-07T01:34:35.462-07:00",
            ],
          });
          verifyObjectDetailPreview({
            rowNumber: 1,
            row: ["User ID", "2023-10-07T01:34:35.462-07:00"],
          });

          H.visitQuestion(ORDERS_QUESTION_ID);
          cy.findAllByTestId("cell-data")
            .eq(10) // 1st data row, 2nd column (User ID)
            .should("have.text", "2023-10-07T01:34:35.462-07:00");
        });
      });

      describe("Unfold JSON", { tags: "@external" }, () => {
        beforeEach(() => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "many_data_types" });
          cy.signInAsAdmin();
          H.resyncDatabase({
            dbId: WRITABLE_DB_ID,
            tableName: "many_data_types",
          });
          cy.intercept(
            "POST",
            `/api/database/${WRITABLE_DB_ID}/sync_schema`,
          ).as("sync_schema");
        });

        it("should let you enable/disable 'Unfold JSON' for JSON columns", () => {
          H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
          TablePicker.getTable("Many Data Types").click();

          cy.log("json is unfolded initially and shows prefix");
          TableSection.getField("Json → A").should("be.visible");
          TableSection.getField("Json → A")
            .findByTestId("name-prefix")
            .should("be.visible")
            .and("have.text", "Json:");

          cy.log("shows prefix in field section");
          TableSection.clickField("Json → A");
          FieldSection.get()
            .findByTestId("name-prefix")
            .should("be.visible")
            .and("have.text", "Json:");
          FieldSection.getRawName()
            .should("be.visible")
            .and("have.text", "json.a");

          cy.log("verify preview");
          FieldSection.getPreviewButton().click();
          verifyTablePreview({
            column: "Json → A",
            values: ["10", "10"],
          });
          verifyObjectDetailPreview({
            rowNumber: 1,
            row: ["Json → A", "10"],
          });

          cy.log("show prefix in table section when sorting");
          TableSection.getSortButton().click();
          TableSection.getField("Json → A")
            .findByTestId("name-prefix")
            .should("be.visible")
            .and("have.text", "Json:");
          TableSection.get().button("Done").click();
          TableSection.clickField("Json");

          FieldSection.getUnfoldJsonInput().should("have.value", "Yes").click();
          H.popover().findByText("No").click();
          cy.wait("@updateField");
          H.expectUnstructuredSnowplowEvent({
            event: "metadata_edited",
            event_detail: "json_unfolding",
            triggered_from: "admin",
          });
          H.undoToast().should(
            "contain.text",
            "JSON unfolding disabled for Json",
          );

          // Check setting has persisted
          cy.reload();
          FieldSection.getUnfoldJsonInput().should("have.value", "No");

          // Sync database
          cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
          cy.button("Sync database schema").click();
          cy.wait("@sync_schema");
          cy.button(/Sync triggered!/).should("be.visible");

          // Check json field is not unfolded
          H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
          TablePicker.getTable("Many Data Types").click();
          TableSection.getField("Json → A").should("not.exist");
        });

        it("should let you change the name of JSON-unfolded columns (metabase#55563)", () => {
          H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
          TablePicker.getTable("Many Data Types").click();
          TableSection.clickField("Json → A");

          TableSection.getFieldNameInput("Json → A").clear().type("A").blur();
          FieldSection.getPreviewButton().click();

          FieldSection.getNameInput().should("have.value", "A");
          FieldSection.get()
            .findByTestId("name-prefix")
            .scrollIntoView()
            .should("be.visible")
            .and("have.text", "Json:");
          verifyTablePreview({
            column: "A",
            values: ["10", "10"],
          });
        });

        it("should smartly truncate prefix name", () => {
          const shortPrefix = "Short prefix";
          const longPrefix = "Legendarily long column prefix";
          H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
          TablePicker.getTable("Many Data Types").click();
          TableSection.clickField("Json → A");

          cy.log("should not truncante short prefixes");
          TableSection.getFieldNameInput("Json")
            .clear()
            .type(shortPrefix)
            .blur();

          cy.log("in field section");
          FieldSection.get()
            .findByTestId("name-prefix")
            .should("have.text", `${shortPrefix}:`)
            .then((element) => {
              H.assertIsNotEllipsified(element[0]);
            });
          FieldSection.get().findByTestId("name-prefix").realHover();
          H.tooltip().should("not.exist");

          cy.log("in table section");
          TableSection.getField("Json → D")
            .findByTestId("name-prefix")
            .should("have.text", `${shortPrefix}:`)
            .then((element) => {
              H.assertIsNotEllipsified(element[0]);
            });
          TableSection.getField("Json → D")
            .findByTestId("name-prefix")
            .realHover();
          H.tooltip().should("not.exist");

          cy.log("should truncante long prefixes");
          TableSection.getFieldNameInput(shortPrefix)
            .clear()
            .type(longPrefix)
            .blur();

          cy.log("in field section");
          FieldSection.get()
            .findByTestId("name-prefix")
            .should("have.text", `${longPrefix}:`)
            .then((element) => {
              H.assertIsEllipsified(element[0]);
            });
          FieldSection.get()
            .findByTestId("name-prefix")
            .realHover({ scrollBehavior: "center" });
          H.tooltip().should("be.visible").and("have.text", longPrefix);

          // hide tooltip
          FieldSection.getDescriptionInput().realHover();
          H.tooltip().should("not.exist");

          cy.log("in table section");
          TableSection.getField("Json → D")
            .scrollIntoView({ offset: { left: 0, top: -400 } })
            .findByTestId("name-prefix")
            .should("have.text", `${longPrefix}:`)
            .realHover({ scrollBehavior: "center" });
          H.tooltip().should("be.visible").and("have.text", longPrefix);
        });
      });
    });

    describe("Formatting", () => {
      it("should let you to change field formatting", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });

        FieldSection.getStyleInput().click();
        H.popover().findByText("Percent").click();
        cy.wait("@updateField");
        H.expectUnstructuredSnowplowEvent({
          event: "metadata_edited",
          event_detail: "formatting",
          triggered_from: "admin",
        });
        verifyAndCloseToast("Formatting of Quantity updated");

        cy.log("verify preview");
        FieldSection.getPreviewButton().click();
        verifyTablePreview({
          column: "Quantity",
          values: ["200%", "300%", "200%", "600%", "500%"],
        });
        verifyObjectDetailPreview({
          rowNumber: 8,
          row: ["Quantity", "200%"],
        });
      });

      it("should only show currency formatting options for currency fields", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.DISCOUNT,
        });
        cy.wait("@metadata");

        cy.findByTestId("column-settings")
          .scrollIntoView()
          .within(() => {
            cy.findByText("Unit of currency").should("be.visible");
            cy.findByText("Currency label style").should("be.visible");
          });

        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });
        cy.wait("@metadata");

        cy.findByTestId("column-settings")
          .scrollIntoView()
          .within(() => {
            // shouldnt show currency settings by default for quantity field
            cy.findByText("Unit of currency").should("not.be.visible");
            cy.findByText("Currency label style").should("not.be.visible");

            cy.get("#number_style").click();
          });

        // if you change the style to currency, currency settings should appear
        H.popover().findByText("Currency").click();
        cy.wait("@updateField");
        verifyAndCloseToast("Formatting of Quantity updated");

        cy.findByTestId("column-settings").within(() => {
          cy.findByText("Unit of currency").should("be.visible");
          cy.findByText("Currency label style").should("be.visible");
        });
      });

      it("should save and obey field prefix formatting settings", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });
        cy.wait("@metadata");

        FieldSection.getPrefixInput().scrollIntoView().type("about ").blur();
        cy.wait("@updateField");
        verifyAndCloseToast("Formatting of Quantity updated");

        cy.log("verify preview");
        FieldSection.getPreviewButton().click();
        verifyTablePreview({
          column: "Quantity",
          values: ["about 2", "about 3", "about 2", "about 6", "about 5"],
        });
        verifyObjectDetailPreview({
          rowNumber: 8,
          row: ["Quantity", "about 2"],
        });

        cy.log("verify viz");
        H.visitQuestionAdhoc({
          dataset_query: {
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["sum", ["field", ORDERS.QUANTITY, null]]],
            },
            type: "query",
          },
        });
        cy.findByTestId("visualization-root")
          .findByText("about 69,540")
          .should("be.visible");
      });

      it("should not call PUT field endpoint when prefix or suffix has not been changed (SEM-359)", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.QUANTITY,
        });
        cy.wait("@metadata");

        FieldSection.getPrefixInput().focus().blur();
        cy.get("@updateFieldSpy").should("not.have.been.called");
        H.undoToast().should("not.exist");

        FieldSection.getSuffixInput().focus().blur();
        cy.get("@updateFieldSpy").should("not.have.been.called");
        H.undoToast().should("not.exist");
      });
    });
  });

  describe("Preview section", () => {
    describe("Esc key", () => {
      it("should allow closing the preview with Esc key", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        PreviewSection.get().should("not.exist");

        FieldSection.getPreviewButton().click();
        PreviewSection.get().should("be.visible");

        cy.realPress("Escape");
        PreviewSection.get().should("not.exist");
      });

      it("should not close the preview when hitting Esc key while modal is open", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getPreviewButton().click();
        PreviewSection.get().should("be.visible");

        TableSection.getSyncOptionsButton().click();
        H.modal().should("be.visible");

        cy.realPress("Escape");
        H.modal().should("not.exist");
        PreviewSection.get().should("be.visible");

        FieldSection.getFieldValuesButton().click();
        H.modal().should("be.visible");

        cy.realPress("Escape");
        H.modal().should("not.exist");
        PreviewSection.get().should("be.visible");
      });

      it("should not close the preview when hitting Esc key while popover is open", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getPreviewButton().click();
        PreviewSection.get().should("be.visible");

        FieldSection.getSemanticTypeInput().click();
        H.popover().should("be.visible");

        cy.realPress("Escape");
        H.popover({ skipVisibilityCheck: true }).should("not.be.visible");
        PreviewSection.get().should("be.visible");
      });

      it("should not close the preview when hitting Esc key while command palette is open", () => {
        H.DataModel.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        FieldSection.getPreviewButton().click();
        PreviewSection.get().should("be.visible");

        H.openCommandPalette();
        H.commandPalette().should("be.visible");

        cy.realPress("Escape");
        H.commandPalette().should("not.exist");
        PreviewSection.get().should("be.visible");
      });
    });

    describe("Empty states", { tags: "@external" }, () => {
      beforeEach(() => {
        H.restore("postgres-writable");
        H.resetTestTable({ type: "postgres", table: "multi_schema" });
        H.resyncDatabase({ dbId: WRITABLE_DB_ID });
        H.queryWritableDB('delete from "Domestic"."Animals"');
      });

      it("should show empty state when there is no data", () => {
        H.DataModel.visit();

        TablePicker.getDatabase("Writable Postgres12").click();
        TablePicker.getSchema("Domestic").click();
        TablePicker.getTable("Animals").click();
        TableSection.clickField("Name");
        FieldSection.getPreviewButton().click();

        PreviewSection.get().findByText("No data to show").should("be.visible");
        PreviewSection.getPreviewTypeInput().findByText("Detail").click();
        PreviewSection.get().findByText("No data to show").should("be.visible");
      });
    });

    it("should not auto-focus inputs in filtering preview", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      FieldSection.getPreviewButton().click();
      PreviewSection.getPreviewTypeInput().findByText("Filtering").click();

      PreviewSection.get()
        .findByPlaceholderText("Enter an ID")
        .should("be.visible")
        .and("not.be.focused");

      FieldSection.getFilteringInput().click();
      H.popover().findByText("A list of all values").click();

      PreviewSection.get()
        .findByPlaceholderText("Search the list")
        .should("be.visible")
        .and("not.be.focused");

      TableSection.clickField("Tax");

      PreviewSection.get()
        .findByPlaceholderText("Min")
        .should("be.visible")
        .and("not.be.focused");

      FieldSection.getFilteringInput().click();
      H.popover().findByText("Search box").click();

      PreviewSection.get()
        .findByPlaceholderText("Enter a number")
        .should("be.visible")
        .and("not.be.focused");
    });

    it("should not crash when viewing filtering preview of a hidden table", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      TablePicker.getTable("Orders").button("Hide table").click();
      cy.wait("@updateTable");

      FieldSection.getPreviewButton().click();
      PreviewSection.getPreviewTypeInput().findByText("Filtering").click();
      PreviewSection.get()
        .findByPlaceholderText("Enter an ID")
        .should("be.visible");
      H.main().findByText("Something’s gone wrong").should("not.exist");
    });
  });

  describe("Error handling", { tags: "@external" }, () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_data_types" });
      cy.signInAsAdmin();
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: "many_data_types",
      });

      const error = { statusCode: 500 };
      cy.intercept("POST", "/api/dataset*", error);
      cy.intercept("PUT", "/api/field/*", error);
      cy.intercept("PUT", "/api/table/*/fields/order", error);
      cy.intercept("POST", "/api/field/*/values", error);
      cy.intercept("POST", "/api/field/*/dimension", error);
      cy.intercept("PUT", "/api/table/*", error);
      cy.intercept("POST", "/api/table/*/sync_schema", error);
      cy.intercept("POST", "/api/table/*/rescan_values", error);
      cy.intercept("POST", "/api/table/*/discard_values", error);
    });

    it("shows toast errors and preview errors", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      cy.log("table section");

      cy.log("name");
      TableSection.getNameInput().type("a").blur();
      verifyAndCloseToast("Failed to update table name");

      cy.log("description");
      TableSection.getDescriptionInput().type("a").blur();
      verifyAndCloseToast("Failed to update table description");

      cy.log("predefined field order");
      TableSection.getSortButton().click();
      TableSection.getSortOrderInput()
        .findByLabelText("Alphabetical order")
        .click();
      verifyAndCloseToast("Failed to update field order");

      cy.log("custom field order");
      TableSection.getSortableField("ID").as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: 50,
      });
      verifyAndCloseToast("Failed to update field order");
      TableSection.get().button("Done").click();

      cy.log("sync");
      TableSection.getSyncOptionsButton().click();
      H.modal().button("Sync table schema").click();
      verifyAndCloseToast("Failed to start sync");

      cy.log("scan");
      H.modal().button("Re-scan table").click();
      verifyAndCloseToast("Failed to start scan");

      cy.log("discard field values");
      H.modal().button("Discard cached field values").click();
      verifyAndCloseToast("Failed to discard values");
      H.modal().findByLabelText("Close").click();

      cy.log("field name");
      TableSection.getFieldNameInput("Quantity").type("a").blur();
      verifyAndCloseToast("Failed to update name of Quantity");

      cy.log("field description");
      TableSection.getFieldDescriptionInput("Quantity").type("a").blur();
      verifyAndCloseToast("Failed to update description of Quantity");

      cy.log("field section");

      cy.log("name");
      FieldSection.getNameInput().type("a").blur();
      verifyAndCloseToast("Failed to update name of Quantity");

      cy.log("description");
      FieldSection.getDescriptionInput().type("a").blur();
      verifyAndCloseToast("Failed to update description of Quantity");

      cy.log("coercion strategy");
      FieldSection.getCoercionToggle().parent().scrollIntoView().click();
      H.popover()
        .findByText("UNIX seconds → Datetime")
        .scrollIntoView()
        .click();
      verifyAndCloseToast("Failed to enable casting for Quantity");

      cy.log("semantic type");
      FieldSection.getSemanticTypeInput().click();
      H.popover().findByText("Score").click();
      verifyAndCloseToast("Failed to update semantic type of Quantity");

      cy.log("visibility");
      FieldSection.getVisibilityInput().click();
      H.popover().findByText("Only in detail views").click();
      verifyAndCloseToast("Failed to update visibility of Quantity");

      cy.log("filtering");
      FieldSection.getFilteringInput().click();
      H.popover().findByText("Search box").click();
      verifyAndCloseToast("Failed to update filtering of Quantity");

      cy.log("display values");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      verifyAndCloseToast("Failed to update display values of Quantity");

      cy.log("JSON unfolding");
      // navigating away would cause onChange to be triggered in InputBlurChange and TextareaBlurChange
      // components, so new undos will appear - this makes this test flaky, so we navigate with page reload instead
      H.DataModel.visit({ databaseId: WRITABLE_DB_ID });
      TablePicker.getTable("Many Data Types").click();
      TableSection.clickField("Json");
      FieldSection.getUnfoldJsonInput().click();
      H.popover().findByText("No").click();
      verifyAndCloseToast("Failed to disable JSON unfolding for Json");

      cy.log("formatting");
      TablePicker.getDatabase("Sample Database").click();
      TablePicker.getTable("Orders").click();
      TableSection.clickField("Quantity");
      FieldSection.getPrefixInput().type("5").blur();
      verifyAndCloseToast("Failed to update formatting of Quantity");

      cy.log("preview section");

      cy.log("table preview");
      FieldSection.getPreviewButton().click();
      PreviewSection.get()
        .findByText("Something went wrong")
        .should("be.visible");

      cy.log("object detail preview");
      PreviewSection.getPreviewTypeInput().findByText("Detail").click();
      PreviewSection.get()
        .findByText("Something went wrong")
        .should("be.visible");
    });
  });

  describe("Undos", { tags: "@external" }, () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_data_types" });
      cy.signInAsAdmin();
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: "many_data_types",
      });
    });

    it("allows to undo every action", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      cy.log("table section");

      cy.log("name");
      TableSection.getNameInput().type("a").blur();
      verifyToastAndUndo("Table name updated");
      TableSection.getNameInput().should("have.value", "Orders");

      cy.log("description");
      TableSection.getDescriptionInput().type("a").blur();
      verifyToastAndUndo("Table description updated");
      TableSection.getDescriptionInput().should(
        "have.value",
        "Confirmed Sample Company orders for a product, from a user.",
      );

      cy.log("predefined field order");
      TableSection.getSortButton().click();
      TableSection.getSortOrderInput()
        .findByLabelText("Alphabetical order")
        .click();
      verifyToastAndUndo("Field order updated");
      TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");

      cy.log("custom field order");
      TableSection.getSortableField("ID").as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: 50,
      });
      verifyToastAndUndo("Field order updated");
      TableSection.getSortOrderInput()
        .findByDisplayValue("database")
        .should("be.checked");
      TableSection.get().button("Done").click();

      cy.log("field name");
      TableSection.getFieldNameInput("Quantity").type("a").blur();
      verifyToastAndUndo("Name of Quantity updated");
      TableSection.getFieldNameInput("Quantity").should(
        "have.value",
        "Quantity",
      );

      cy.log("field description");
      TableSection.getFieldDescriptionInput("Quantity").type("a").blur();
      verifyToastAndUndo("Description of Quantity updated");
      TableSection.getFieldDescriptionInput("Quantity").should(
        "have.value",
        "Number of products bought.",
      );

      cy.log("field section");

      cy.log("name");
      FieldSection.getNameInput().type("a").blur();
      verifyToastAndUndo("Name of Quantity updated");
      FieldSection.getNameInput().should("have.value", "Quantity");

      cy.log("description");
      FieldSection.getDescriptionInput().type("a").blur();
      verifyToastAndUndo("Description of Quantity updated");
      FieldSection.getDescriptionInput().should(
        "have.value",
        "Number of products bought.",
      );

      cy.log("coercion strategy");
      FieldSection.getCoercionToggle().parent().scrollIntoView().click();
      H.popover()
        .findByText("UNIX seconds → Datetime")
        .scrollIntoView()
        .click();
      verifyToastAndUndo("Casting enabled for Quantity");
      FieldSection.getCoercionToggle().should("not.be.checked");

      cy.log("semantic type");
      FieldSection.getSemanticTypeInput().click();
      H.popover().findByText("Score").click();
      verifyToastAndUndo("Semantic type of Quantity updated");
      FieldSection.getSemanticTypeInput().should("have.value", "Quantity");

      cy.log("visibility");
      FieldSection.getVisibilityInput().click();
      H.popover().findByText("Only in detail views").click();
      verifyToastAndUndo("Visibility of Quantity updated");
      FieldSection.getVisibilityInput().should("have.value", "Everywhere");

      cy.log("filtering");
      FieldSection.getFilteringInput().click();
      H.popover().findByText("Search box").click();
      verifyToastAndUndo("Filtering of Quantity updated");
      FieldSection.getFilteringInput().should(
        "have.value",
        "A list of all values",
      );

      cy.log("display values");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      H.modal().should("be.visible");
      H.modal().button("Close").click();
      verifyToastAndUndo("Display values of Quantity updated");
      FieldSection.getDisplayValuesInput().should(
        "have.value",
        "Use original value",
      );

      cy.log("custom mapping");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      verifyAndCloseToast("Display values of Quantity updated");
      H.modal().within(() => {
        cy.findByDisplayValue("0")
          .clear()
          .type("XYZ", { scrollBehavior: "center" })
          .blur();
        cy.button("Save").click();
      });
      verifyToastAndUndo("Display values of Quantity updated");
      FieldSection.get().button("Edit mapping").click();
      H.modal().within(() => {
        cy.findByDisplayValue("0").should("be.visible");
        cy.findByDisplayValue("XYZ").should("not.exist");
        cy.button("Close").click();
      });

      cy.log("foreign key");
      TableSection.clickField("User ID");
      FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Use foreign key").click();
      verifyToastAndUndo("Display values of User ID updated");
      FieldSection.getDisplayValuesInput().should(
        "have.value",
        "Use original value",
      );

      cy.log("JSON unfolding");
      TablePicker.getDatabase("Writable Postgres12").click();
      TablePicker.getTable("Many Data Types").click();
      TableSection.clickField("Json");
      FieldSection.getUnfoldJsonInput().click();
      H.popover().findByText("No").click();
      verifyToastAndUndo("JSON unfolding disabled for Json");
      FieldSection.getUnfoldJsonInput().should("have.value", "Yes");

      cy.log("formatting");
      TablePicker.getTable("Orders").click();
      TableSection.clickField("Quantity");

      cy.log("prefix (ChartSettingInput)");
      FieldSection.getPrefixInput().type("5").blur();
      verifyToastAndUndo("Formatting of Quantity updated");
      FieldSection.getPrefixInput().should("have.value", "");

      cy.log("multiply by number (ChartSettingInputNumeric)");
      FieldSection.getMultiplyByNumberInput().type("5").blur();
      verifyToastAndUndo("Formatting of Quantity updated");
      FieldSection.getMultiplyByNumberInput().should("have.value", "");

      cy.log("mini bar chart (ChartSettingToggle)");
      FieldSection.getMiniBarChartToggle()
        .parent()
        .click({ scrollBehavior: "center" });
      verifyToastAndUndo("Formatting of Quantity updated");
      FieldSection.getMiniBarChartToggle().should("not.be.checked");
    });
  });

  describe("Responsiveness", () => {
    it("should hide labels of buttons when they don't fit", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.QUANTITY,
      });

      cy.log("buttons should show labels when they fit");
      TableSection.getSyncOptionsButton().should("have.text", "Sync options");
      TableSection.getSortButton().should("have.text", "Sorting").click();
      TableSection.getSortDoneButton().should("have.text", "Done").click();
      FieldSection.getPreviewButton().should("have.text", "Preview");
      FieldSection.getFieldValuesButton().should("have.text", "Field values");

      cy.log("buttons should not show labels when they don't fit");
      cy.viewport(800, 800);
      TableSection.getSyncOptionsButton().should(
        "not.have.text",
        "Sync options",
      );
      TableSection.getSortButton().should("not.have.text", "Sorting").click();
      TableSection.getSortDoneButton().should("not.have.text", "Done").click();
      FieldSection.getPreviewButton().should("not.have.text", "Preview");
      FieldSection.getFieldValuesButton().should(
        "not.have.text",
        "Field values",
      );

      cy.log("buttons should have tooltips when labels are not shown");
      TableSection.getSyncOptionsButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Sync options");

      TableSection.getSortButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Sorting");

      TableSection.getSortButton().click();
      TableSection.getSortDoneButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Done");
      TableSection.getSortDoneButton().click();

      FieldSection.getPreviewButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Preview");

      FieldSection.getFieldValuesButton().realHover({
        scrollBehavior: "center",
      });
      H.tooltip().should("be.visible").and("have.text", "Field values");

      cy.log("button labels should reappear when they can fit again");
      cy.viewport(1200, 800);
      TableSection.getSyncOptionsButton().should("have.text", "Sync options");
      TableSection.getSortButton().should("have.text", "Sorting").click();
      TableSection.getSortDoneButton().should("have.text", "Done").click();
      FieldSection.getPreviewButton().should("have.text", "Preview");
      FieldSection.getFieldValuesButton().should("have.text", "Field values");
    });
  });
});

function turnTableVisibilityOff(tableId: TableId) {
  cy.request("PUT", "/api/table", {
    ids: [tableId],
    visibility_type: "hidden",
  });
}

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

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}

function verifyToastAndUndo(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().button("Undo").click();
  H.undoToast().should("contain.text", "Change undone");
  H.undoToast().icon("close").click({ force: true });
}

function verifyTablesVisible(tables: string[]) {
  for (const table of tables) {
    TablePicker.getTable(table).button("Hide table").should("exist");
  }
}

function verifyTablesHidden(tables: string[]) {
  for (const table of tables) {
    TablePicker.getTable(table).button("Unhide table").should("be.visible");
  }
}
