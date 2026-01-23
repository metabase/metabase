import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { TablePicker } = cy.H.DataModel;

const { ORDERS_ID } = SAMPLE_DATABASE;

function createContext(place: string) {
  return {
    basePath: place === "admin" ? "/admin/datamodel" : "/data-studio/data",
    visit: place === "admin" ? H.DataModel.visit : H.DataModel.visitDataStudio,
  };
}

const areas = ["admin", "data studio"];

describe.each<string>(areas)("scenarios > admin > data model > %s", (area) => {
  let context: ReturnType<typeof createContext>;

  beforeEach(() => {
    context = createContext(area);

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
      cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
      cy.intercept("PUT", "/api/table").as("updateTables");
    }

    cy.log("area is " + area);

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
      cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
      cy.intercept("PUT", "/api/table").as("updateTables");
      cy.intercept("PUT", "/api/table/*").as("updateTable");
    }
  });

  describe("Data loading", () => {
    it("should show 404 if database does not exist (metabase#14652)", () => {
      const context = createContext(area);
      context.visit({ databaseId: 54321, skipWaiting: true });
      cy.wait("@databases");
      cy.wait(100); // wait with assertions for React effects to kick in

      TablePicker.getDatabases().should("have.length", 1);
      TablePicker.getTables().should("have.length", 0);
      H.DataModel.get().findByText("Not found.").should("be.visible");
      cy.location("pathname").should(
        "eq",
        `${context.basePath}/database/54321`,
      );
    });

    it("should show 404 if table does not exist", () => {
      const context = createContext(area);
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
      cy.location("pathname").should(
        "eq",
        `${context.basePath}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/12345`,
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
        const context = createContext(area);
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
          cy.wait(["@datamodel/visit/databases", "@datamodel/visit/metadata"]);
        }

        TablePicker.getDatabases().should("have.length", 1);
        TablePicker.getTables().should("have.length", 8);
        cy.location("pathname").should(
          "eq",
          `${context.basePath}/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/12345`,
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
});

function verifyTableSectionEmptyState() {
  H.DataModel.get()
    .findByText("Start by selecting data to model")
    .should("be.visible");
  H.DataModel.get()
    .findByText("Browse your databases to find the table you’d like to edit.")
    .should("be.visible");
}
