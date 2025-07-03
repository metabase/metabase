const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;
const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;

describe("scenarios > admin > datamodel > editor", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/database/*/schema/*").as("fetchTables");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("fetchMetadata");
    cy.intercept("PUT", "/api/table").as("updateTables");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
    cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
  });

  describe("databases without schemas", { tags: ["@external"] }, () => {
    beforeEach(() => {
      H.restore("mysql-8");
      cy.signInAsAdmin();
    });

    it("should be able to select and update a table in a database without schemas", () => {
      H.DataModel.visit({
        databaseId: MYSQL_DB_ID,
        schemaId: MYSQL_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getNameInput().clear().type("New orders").blur();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Table name updated");
      H.DataModel.TableSection.getNameInput().should(
        "have.value",
        "New orders",
      );
    });

    it("should be able to select and update a field in a database without schemas", () => {
      H.DataModel.visit({
        databaseId: MYSQL_DB_ID,
        schemaId: MYSQL_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.clickField("Tax");
      H.DataModel.FieldSection.getVisibilityInput().click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Visibility for Tax updated");
      H.DataModel.FieldSection.getVisibilityInput().should(
        "have.value",
        "Do not include",
      );
    });
  });
});
