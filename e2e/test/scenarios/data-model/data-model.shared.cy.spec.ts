import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";

const { H } = cy;
const { TablePicker } = cy.H.DataModel;

function createContext(place: string) {
  return {
    basePath: place === "admin" ? "/admin/datamodel" : "/data-studio/data",
    visit: place === "admin" ? H.DataModel.visit : H.DataModel.visitDataStudio,
  };
}

const areas = ["admin", "data studio"];

describe.each<string>(areas)("scenarios > admin > data model > %s", (area) => {
  beforeEach(() => {
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
