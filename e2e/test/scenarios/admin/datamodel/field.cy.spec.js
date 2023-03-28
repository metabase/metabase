import {
  restore,
  withDatabase,
  visitAlias,
  popover,
  resetTestTable,
  startNewQuestion,
  resyncDatabase,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// [quarantine] - intermittently failing, possibly due to a "flickering" element (re-rendering)
describe.skip("scenarios > admin > datamodel > field", () => {
  beforeEach(() => {
    cy.signInAsAdmin();

    ["CREATED_AT", "PRODUCT_ID", "QUANTITY"].forEach(name => {
      cy.wrap(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/table/${ORDERS_ID}/${ORDERS[name]}/general`,
      ).as(`ORDERS_${name}_URL`);
    });

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("POST", "/api/field/*/dimension").as("fieldDimensionUpdate");
  });

  describe("Name and Description", () => {
    before(restore);

    it("lets you change field name and description", () => {
      visitAlias("@ORDERS_CREATED_AT_URL");

      cy.get('input[name="display_name"]').as("display_name");
      cy.get('input[name="description"]').as("description");

      // update the name
      cy.get("@display_name")
        .should("have.value", "Created At")
        .clear()
        .type("new display_name")
        .blur();
      cy.wait("@fieldUpdate");

      // update the description
      cy.get("@description")
        .should("have.value", "The date and time an order was submitted.")
        .clear()
        .type("new description")
        .blur();
      cy.wait("@fieldUpdate");

      // reload and verify they have been updated
      cy.reload();
      cy.get("@display_name").should("have.value", "new display_name");
      cy.get("@description").should("have.value", "new description");
    });
  });

  describe("Visibility", () => {
    before(restore);

    it("lets you change field visibility", () => {
      visitAlias("@ORDERS_CREATED_AT_URL");

      cy.contains("Everywhere").click();
      cy.contains("Do not include").click({ force: true });
      cy.wait("@fieldUpdate");

      cy.reload();
      cy.contains("Do not include");
    });
  });

  describe("Filtering on this field", () => {
    before(restore);

    it("lets you change to 'Search box'", () => {
      visitAlias("@ORDERS_QUANTITY_URL");

      cy.contains("A list of all values").click();
      cy.contains("Search box").click();
      cy.wait("@fieldUpdate");

      cy.reload();
      cy.contains("Search box");
    });
  });

  describe("Display Values", () => {
    before(restore);

    it("lets you change to 'Use foreign key' and change the target for field with fk", () => {
      visitAlias("@ORDERS_PRODUCT_ID_URL");

      cy.contains("Use original value").click();
      cy.contains("Use foreign key").click();
      cy.contains("Title").click();
      cy.wait("@fieldDimensionUpdate");

      cy.reload();
      cy.contains("Use foreign key");
      cy.contains("Title");
    });

    // [quarantined]: flake, blocking 3rd party PR
    it.skip("allows 'Custom mapping' null values", () => {
      restore("withSqlite");
      cy.signInAsAdmin();
      const dbId = 2;
      withDatabase(
        dbId,
        ({ number_with_nulls: { num }, number_with_nulls_ID }) =>
          cy.visit(
            `/admin/datamodel/database/${dbId}/table/${number_with_nulls_ID}/${num}/general`,
          ),
      );

      // change to custom mapping
      cy.findByText("Use original value").click();
      popover().findByText("Custom mapping").click();

      // update text for nulls from "null" to "nothin"
      cy.get("input[value=null]").clear().type("nothin");
      cy.findByText("Save").click();
      cy.findByText("Saved!");

      // check that it appears in QB
      startNewQuestion();
      cy.findByText("sqlite").click();
      cy.findByText("Number With Nulls").click();
      cy.findByText("nothin");
    });
  });
});
    
function getUnfoldJsonContent() {
  return cy
    .findByText("Unfold JSON")
    .closest("section")
    .find("[data-testid='select-button-content']")
}

describe("Unfold JSON", () => {
  beforeEach(() => {
    resetTestTable({ type: "postgres", table: "many_data_types" });
    restore(`postgres-writable`);
    cy.signInAsAdmin();
    resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "many_data_types" });
  });
  
  it("lets you enable/disable 'Unfold JSON' for JSON columns", () => {
    cy.intercept("POST", `/api/database/${WRITABLE_DB_ID}/sync_schema`).as(
      "sync_schema",
    );
    // Go to field settings
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    cy.contains("Many Data Types").click();

    // Check json is unfolded initially
    cy.contains("json.a").should("be.visible");
    cy.get("[data-testid='column-json'] [aria-label='gear icon']").click();
    
    getUnfoldJsonContent().contains("Yes").click();
    popover().within(() => {
      cy.findByText("No").click();
    });

    // Check setting has persisted
    cy.reload();
    getUnfoldJsonContent().contains("No");

    // Sync database
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.findByText("Sync database schema now").click();
    cy.wait("@sync_schema");
    cy.findByText("Sync triggered!");

    // Check json field is not unfolded
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    cy.contains("Many Data Types").click();
    cy.contains("json.a").should("not.exist");
  });
});
