import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;
const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;
const { TablePicker, TableSection } = H.DataModel;
const DATA_STUDIO_BASE_PATH = "/data-studio/data";
const visitAdminDataModel = H.DataModel.visit;

H.DataModel.visit = (options = {}) =>
  visitAdminDataModel({ ...options, basePath: DATA_STUDIO_BASE_PATH });

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

  describe("Table picker", () => {
    describe("No databases", () => {
      beforeEach(() => {
        cy.request("DELETE", `/api/database/${SAMPLE_DB_ID}`);
      });

      it("should allow to navigate databases, schemas, and tables", () => {
        H.DataModel.visit();

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

        H.DataModel.visit();

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

        H.DataModel.visit();

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

        H.DataModel.visit({
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
        H.DataModel.visit();

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
        H.DataModel.visit();

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
          H.DataModel.visit();

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
          H.DataModel.visit();

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
          H.DataModel.visit();

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
});
