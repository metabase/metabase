import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { TablePicker, TableSection, FieldSection, PreviewSection } =
  cy.H.DataModel;

const { ORDERS_ID, ORDERS, FEEDBACK_ID, FEEDBACK, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;

function createContext(place: string) {
  return {
    basePath: place === "admin" ? "/admin/datamodel" : "/data-studio/data",
    visit: place === "admin" ? H.DataModel.visit : H.DataModel.visitDataStudio,
  };
}

class DataModelContext {
  constructor(public readonly area: string) {
    this.area = area;
  }

  get basePath() {
    return this.area === "admin" ? "/admin/datamodel" : "/data-studio/data";
  }

  visit(
    ...args:
      | Parameters<typeof H.DataModel.visit>
      | Parameters<typeof H.DataModel.visitDataStudio>
  ) {
    this.area === "admin"
      ? H.DataModel.visit(...args)
      : H.DataModel.visitDataStudio(...args);
  }

  checkLocation(path: string) {
    cy.location("pathname").should("eq", `${this.basePath}${path}`);
  }

  getTriggeredFrom() {
    return this.area === "admin" ? "admin" : "data_studio";
  }
}

const areas: Array<"admin" | "data studio"> = ["admin", "data studio"];
type Area = (typeof areas)[number];

describe.each<Area>(areas)(
  "scenarios > admin > data model > %s",
  (area: Area) => {
    let context: DataModelContext;

    beforeEach(() => {
      context = new DataModelContext(area);

      if (area === "admin") {
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
        cy.intercept("POST", "/api/field/*/dimension").as(
          "updateFieldDimension",
        );
        cy.intercept("PUT", "/api/table").as("updateTables");
        cy.intercept("PUT", "/api/table/*").as("updateTable");
      }

      if (area === "data studio") {
        H.restore();
        H.resetSnowplow();
        cy.signInAsAdmin();
        H.activateToken("bleeding-edge");

        cy.intercept("GET", "/api/database").as("databases");
        cy.intercept("GET", "/api/database/*/schemas?*").as("schemas");
        cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
        cy.intercept("GET", "/api/database/*/schema/*").as("schema");
        cy.intercept("POST", "/api/dataset*").as("dataset");
        cy.intercept("GET", "/api/field/*/values").as("fieldValues");
        cy.intercept("GET", "/api/table?*").as("listTables");
        cy.intercept("PUT", "/api/field/*", cy.spy().as("updateFieldSpy")).as(
          "updateField",
        );
        cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
        cy.intercept("POST", "/api/field/*/values").as("updateFieldValues");
        cy.intercept("POST", "/api/field/*/dimension").as(
          "updateFieldDimension",
        );
        cy.intercept("PUT", "/api/table").as("updateTables");
        cy.intercept("PUT", "/api/table/*").as("updateTable");
      }
    });

    describe("Data loading", () => {
      it("should show 404 if database does not exist (metabase#14652)", () => {
        context.visit({ databaseId: 54321, skipWaiting: true });
        cy.wait("@databases");
        cy.wait(100); // wait with assertions for React effects to kick in

        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getTables().should("have.length", 0);
        H.DataModel.get().findByText("Not found.").should("be.visible");
        context.checkLocation("/database/54321");
      });

      it("should show 404 if table does not exist", () => {
        context.visit({
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
        context.checkLocation(
          `/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/12345`,
        );
        if (area === "admin") {
          verifyAdminTableSectionEmptyState();
        }
      });

      it(
        "should show 404 if field does not exist",
        // We eliminate the flakiness by removing the need to scroll horizontally
        { viewportWidth: 1600 },
        () => {
          context.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: 12345, // we're force navigating to a fake field id
            skipWaiting: true,
          });
          if (area === "admin") {
            cy.wait("@databases");
            cy.wait(100); // wait with assertions for React effects to kick in
          } else {
            cy.wait([
              "@datamodel/visit/databases",
              "@datamodel/visit/metadata",
            ]);
          }

          TablePicker.getDatabases().should("have.length", 1);
          TablePicker.getTables().should("have.length", 8);
          context.checkLocation(
            `/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/12345`,
          );

          if (area === "data-studio") {
            H.DataModel.get().within(() => {
              cy.findByText("Field details").should("be.visible");
              cy.findByText("Not found.").should("be.visible");
            });
          }
        },
      );

      it(
        "should not show 404 error if database is not selected",
        { tags: ["@external"] },
        () => {
          const context = createContext(area);
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });

          cy.log("database not selected");
          context.visit();
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
          context.visit();

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
          H.activateToken("bleeding-edge");
          cy.signInAsAdmin();

          context.visit();

          TablePicker.getDatabase("QA MySQL8").click();
          TablePicker.getTables().should("have.length", 4);
          TablePicker.getSchemas().should("have.length", 0);

          cy.location("pathname").should(
            "eq",
            `${context.basePath}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`,
          );

          TablePicker.getTable("Products").click();
          TableSection.getNameInput().should("have.value", "Products");

          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `${context.basePath}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}/table/`,
            );
          });
        });

        it("should allow searching for tables", { tags: ["@external"] }, () => {
          H.restore("mysql-8");
          context.visit();

          TablePicker.getSearchInput().type("rEvIeWs");
          TablePicker.getDatabases().should("have.length", 2);
          TablePicker.getDatabase("QA MySQL8").should("be.visible");
          TablePicker.getDatabase("Sample Database").should("be.visible");
          TablePicker.getTables().should("have.length", 2);

          TablePicker.getTables().eq(0).click();
          TableSection.getNameInput().should("have.value", "Reviews");
          if (area === "admin") {
            verifyFieldSectionEmptyState();
          }
          cy.location("pathname").should((pathname) => {
            return pathname.startsWith(
              `${context.basePath}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}/table/`,
            );
          });
        });

        it("should restore previously selected table when expanding the tree", () => {
          H.restore("mysql-8");
          cy.signInAsAdmin();

          context.visit({
            databaseId: MYSQL_DB_ID,
            schemaId: MYSQL_DB_SCHEMA_ID,
          });

          TablePicker.getDatabase("QA MySQL8").click();
          cy.location("pathname").should(
            "eq",
            `${context.basePath}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`,
          );

          TablePicker.getDatabase("QA MySQL8").click();
          cy.location("pathname").should(
            "eq",
            `${context.basePath}/database/${MYSQL_DB_ID}/schema/${MYSQL_DB_SCHEMA_ID}`,
          );

          cy.log("ensure navigation to another db works");
          TablePicker.getDatabase("Sample Database").click();
          TablePicker.getTables().should("have.length", 12);
        });
      });

      describe("1 database, 1 schema", () => {
        it("should allow to navigate databases, schemas, and tables", () => {
          context.visit();

          cy.log("should auto-open the only schema in the only database");
          context.checkLocation(
            `/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}`,
          );

          TablePicker.getDatabases().should("have.length", 1);
          TablePicker.getDatabase("Sample Database").should("be.visible");
          TablePicker.getSchemas().should("have.length", 0);
          TablePicker.getTables().should("have.length", 8);
          TableSection.get().should("not.exist");
          TablePicker.getTable("Orders").should("be.visible").click();

          context.checkLocation(
            `/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
          );
          TableSection.get().should("be.visible");
          if (area === "admin") {
            verifyFieldSectionEmptyState();
          }

          TablePicker.getTable("Products").should("be.visible").click();
          context.checkLocation(
            `/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PRODUCTS_ID}`,
          );

          TableSection.get().should("be.visible");
          if (area === "admin") {
            verifyFieldSectionEmptyState();
          }
        });

        it("should allow to search for tables", () => {
          context.visit();

          TablePicker.getSearchInput().type("or");
          TablePicker.getDatabases().should("have.length", 1);
          TablePicker.getSchemas().should("have.length", 1);
          TablePicker.getTables().should("have.length", 2);
          TablePicker.getTable("Orders").should("be.visible").click();
          context.checkLocation(
            `/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
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
      });

      describe(
        "mutliple databases, with single and multiple schemas",
        { tags: "@external" },
        () => {
          beforeEach(() => {
            H.restore("postgres-writable");
            H.activateToken("bleeding-edge");
            cy.signInAsAdmin();

            H.resetTestTable({ type: "postgres", table: "multi_schema" });
            H.resyncDatabase({ dbId: WRITABLE_DB_ID });
          });

          it("should allow to navigate databases, schemas, and tables", () => {
            context.visit();
            if (area === "admin") {
              context.checkLocation("/database");
            } else {
              context.checkLocation("");
            }

            TablePicker.getDatabases().should("have.length", 2);
            TablePicker.getSchemas().should("have.length", 0);
            TablePicker.getTables().should("have.length", 0);
            TablePicker.getDatabase("Sample Database").should("be.visible");

            cy.log("open database");
            TablePicker.getDatabase("Writable Postgres12")
              .should("be.visible")
              .click();
            context.checkLocation(`/database/${WRITABLE_DB_ID}`);
            TablePicker.getDatabases().should("have.length", 2);
            TablePicker.getSchemas().should("have.length", 2);
            TablePicker.getTables().should("have.length", 0);
            TablePicker.getSchema("Wild").should("be.visible");
            TablePicker.getSchema("Domestic").should("be.visible");

            cy.log("open schema");
            TablePicker.getSchema("Domestic").click();
            context.checkLocation(
              `/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic`,
            );
            TablePicker.getDatabases().should("have.length", 2);
            TablePicker.getSchemas().should("have.length", 2);
            TablePicker.getTables().should("have.length", 1);
            TablePicker.getTable("Animals").should("be.visible");

            cy.log("open table");
            TablePicker.getTable("Animals").click();
            cy.location("pathname").should((pathname) => {
              return pathname.startsWith(
                `${context.basePath}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
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
                `${context.basePath}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
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
                `${context.basePath}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
              );
            });
            TableSection.getNameInput().should("have.value", "Birds");

            cy.log("close schema");
            if (area === "admin") {
              TablePicker.getSchema("Wild").click();
            }
            if (area === "data studio") {
              TablePicker.getSchema("Wild").within(() => {
                cy.findByRole("button", { name: "Collapse" }).click();
              });
            }

            TablePicker.getDatabases().should("have.length", 2);
            TablePicker.getSchemas().should("have.length", 2);
            TablePicker.getTables().should("have.length", 1);
            TablePicker.getTable("Birds").should("not.exist");

            cy.log("close database");
            if (area === "admin") {
              TablePicker.getDatabase("Writable Postgres12").click();
            }
            if (area === "data studio") {
              TablePicker.getDatabase("Writable Postgres12").within(() => {
                cy.findByRole("button", { name: "Collapse" }).click();
              });
            }
            TablePicker.getDatabases().should("have.length", 2);
            TablePicker.getSchemas().should("have.length", 0);
            TablePicker.getTables().should("have.length", 0);

            cy.log("we still have a table opened");
            cy.location("pathname").should((pathname) => {
              return pathname.startsWith(
                `${context.basePath}/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic/table/`,
              );
            });

            if (area === "admin") {
              cy.log("databases, schemas, and tables should be links");
              TablePicker.getDatabase("Sample Database").click();
              TablePicker.getDatabase("Writable Postgres12").click();
              TablePicker.getDatabase("Writable Postgres12")
                .should("have.prop", "tagName", "A")
                .and(
                  "have.attr",
                  "href",
                  `/admin/datamodel/database/${WRITABLE_DB_ID}`,
                );
              TablePicker.getSchema("Domestic")
                .should("have.prop", "tagName", "A")
                .and(
                  "have.attr",
                  "href",
                  `/admin/datamodel/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Domestic`,
                );
              TablePicker.getTable("Orders")
                .should("have.prop", "tagName", "A")
                .and(
                  "have.attr",
                  "href",
                  `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
                );
            }
          });
        },
      );
    });

    describe("Table section", () => {
      it("should show all tables in sample database and fields in orders table", () => {
        context.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        TablePicker.getTables().should("have.length", 8);

        TableSection.clickField("ID");

        if (area === "data studio") {
          // Sometimes in CI this doesn't happen
          FieldSection.get().scrollIntoView();
        }

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
        context.visit({
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });
        TableSection.getQueryBuilderLink().click();
        H.queryBuilderHeader().findByText("Orders").should("be.visible");
      });

      it("should be able to see details of a table", () => {
        context.visit({ databaseId: SAMPLE_DB_ID });

        if (area === "admin") {
          verifyAdminTableSectionEmptyState();
        } else {
          verifyDataStudioTableSectionEmptyState();
        }

        TablePicker.getTable("Orders").click();
        if (area === "admin") {
          verifyFieldSectionEmptyState();
        } else {
          verifyDataStudioFieldSectionEmptyState();
        }
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

          context.visit({
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

          context.visit();
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
          context.visit({
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

        it("should allow changing the table description", () => {
          context.visit({
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

        it("should allow clearing the table description", () => {
          context.visit({
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
          context.visit({
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

        it("should allow changing the field description", () => {
          context.visit({
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
          context.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
          });

          TableSection.getFieldDescriptionInput("Total").clear().blur();
          cy.wait("@updateField");
          verifyAndCloseToast("Description of Total updated");
          TableSection.getFieldDescriptionInput("Total").should(
            "have.value",
            "",
          );

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
          context.visit({
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: ORDERS_ID,
            fieldId: ORDERS.TAX,
          });

          FieldSection.getNameInput().clear().type("New tax").blur();
          cy.wait("@updateField");
          verifyAndCloseToast("Name of Tax updated");
          TableSection.getFieldNameInput("New tax").should("exist");

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

        it("should allow changing the field description", () => {
          context.visit({
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
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Total").should("be.visible");
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("New description").should("be.visible");
        });

        it("should remap FK display value from field section", () => {
          context.visit({
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
          context.visit({
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
          context.visit({
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
            context.visit({
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
              triggered_from: context.getTriggeredFrom(),
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
            context.visit({
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
            context.visit({
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
              triggered_from: context.getTriggeredFrom(),
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
            context.visit({
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
              .scrollIntoView() //This should not be necessary, but CI consistently fails to scroll into view on mount
              .should("be.visible")
              .and("have.value", "Products → ID");
          });

          it("should allow to change the foreign key target", () => {
            context.visit({
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

          it("should allow to change the type to 'Currency' and choose the currency (metabase#59052)", () => {
            context.visit({
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
            // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
            cy.findByText("Tax (CA$)").should("be.visible");
          });

          it("should correctly filter out options in Foreign Key picker (metabase#56839)", () => {
            context.visit({
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
            context.visit({
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
            context.visit({ databaseId: SAMPLE_DB_ID });
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

              context.visit({ databaseId: WRITABLE_DB_ID });
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
            context.visit({
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
              triggered_from: context.getTriggeredFrom(),
            });
            verifyAndCloseToast("Visibility of Tax updated");
            FieldSection.getVisibilityInput().should(
              "have.value",
              "Everywhere",
            );

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
            context.visit({
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
              .should("exist");
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
            context.visit({
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
              .should("exist");
          });

          it("should let you change field visibility to 'Only in detail views'", () => {
            context.visit({
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
              .should("exist");
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
              context.visit({
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
            context.visit({
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
              triggered_from: context.getTriggeredFrom(),
            });
            verifyAndCloseToast("Filtering of Quantity updated");

            cy.log("verify preview");
            TableSection.clickField("Quantity");
            FieldSection.getPreviewButton().click();
            PreviewSection.getPreviewTypeInput()
              .findByText("Filtering")
              .click();
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
            context.visit({
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
            PreviewSection.getPreviewTypeInput()
              .findByText("Filtering")
              .click();
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
            context.visit({
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
            PreviewSection.getPreviewTypeInput()
              .findByText("Filtering")
              .click();
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
            context.visit({
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
            context.visit({
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
              triggered_from: context.getTriggeredFrom(),
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
        });
      });
    });
  },
);

function verifyAdminTableSectionEmptyState() {
  H.DataModel.get()
    .findByText("Start by selecting data to model")
    .should("be.visible");
  H.DataModel.get()
    .findByText("Browse your databases to find the table you’d like to edit.")
    .should("be.visible");
}

function verifyDataStudioTableSectionEmptyState() {
  H.DataModel.TableSection.get().should("not.exist");
}

function verifyFieldSectionEmptyState() {
  H.DataModel.get()
    .findByText("Edit the table and fields")
    .should("be.visible");
  H.DataModel.get()
    .findByText(
      "Select a field to edit its name, description, formatting, and more.",
    )
    .should("be.visible");
}

function verifyDataStudioFieldSectionEmptyState() {
  H.DataModel.FieldSection.get().should("not.exist");
}

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
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

function clickAway() {
  cy.get("body").click(0, 0);
}
