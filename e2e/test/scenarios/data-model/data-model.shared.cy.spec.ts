import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { TablePicker, TableSection, FieldSection } = cy.H.DataModel;

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

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
          verifyTableSectionEmptyState();
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
    });
  },
);

function verifyTableSectionEmptyState() {
  H.DataModel.get()
    .findByText("Start by selecting data to model")
    .should("be.visible");
  H.DataModel.get()
    .findByText("Browse your databases to find the table you’d like to edit.")
    .should("be.visible");
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
