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
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  PRODUCTS,
  REVIEWS,
  REVIEWS_ID,
  PRODUCTS_ID,
} = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;
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
      it("should allow to search for tables", () => {
        H.DataModel.visit();

        TablePicker.getSearchInput().type("or");
        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getSchemas().should("have.length", 1);
        TablePicker.getTables().should("have.length", 2);
        TablePicker.getTable("Orders").should("be.visible").click();
        cy.location("pathname").should(
          "eq",
          `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
        );
        TableSection.getNameInput().should("have.value", "Orders");

        cy.log("no results");
        TablePicker.getSearchInput().clear().type("xyz");
        TablePicker.get().findByText("No results.").should("be.visible");

        cy.log("go back to browsing");
        TablePicker.getSearchInput().clear();
        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getSchemas().should("have.length", 0);
        TablePicker.getTables().should("have.length", 8);
      });

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
    describe("Name and description", () => {
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
    });

    describe("Field name and description", () => {
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
    });

    describe("Metadata", () => {
      describe("Semantic type", () => {
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
      });
    });

    describe("Behavior", () => {
      describe("Display values", () => {
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
