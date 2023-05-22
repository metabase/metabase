import {
  restore,
  withDatabase,
  visitAlias,
  popover,
  resetTestTable,
  startNewQuestion,
  resyncDatabase,
} from "e2e/support/helpers";
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// [quarantine] - intermittently failing, possibly due to a "flickering" element (re-rendering)
describe.skip("scenarios > admin > datamodel > field", () => {
  beforeEach(() => {
    cy.signInAsAdmin();

    ["CREATED_AT", "PRODUCT_ID", "QUANTITY"].forEach(name => {
      cy.wrap(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS[name]}/general`,
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Everywhere").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Do not include").click({ force: true });
      cy.wait("@fieldUpdate");

      cy.reload();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Do not include");
    });
  });

  describe("Filtering on this field", () => {
    before(restore);

    it("lets you change to 'Search box'", () => {
      visitAlias("@ORDERS_QUANTITY_URL");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("A list of all values").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Search box").click();
      cy.wait("@fieldUpdate");

      cy.reload();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Search box");
    });
  });

  describe("Display Values", () => {
    before(restore);

    it("lets you change to 'Use foreign key' and change the target for field with fk", () => {
      visitAlias("@ORDERS_PRODUCT_ID_URL");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Use original value").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Use foreign key").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Title").click();
      cy.wait("@fieldDimensionUpdate");

      cy.reload();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Use foreign key");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
            `/admin/datamodel/database/${dbId}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${number_with_nulls_ID}/field/${num}/general`,
          ),
      );

      // change to custom mapping
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Use original value").click();
      popover().findByText("Custom mapping").click();

      // update text for nulls from "null" to "nothin"
      cy.get("input[value=null]").clear().type("nothin");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved!");

      // check that it appears in QB
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("sqlite").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Number With Nulls").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("nothin");
    });
  });
});

function getUnfoldJsonContent() {
  return cy
    .findByText("Unfold JSON")
    .closest("section")
    .findByTestId("select-button-content");
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Many Data Types/i).click();

    // Check json is unfolded initially
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/json.a/i).should("be.visible");
    cy.findByTestId("column-json").within(() => {
      cy.icon("gear").click();
    });

    getUnfoldJsonContent().findByText(/Yes/i).click();
    popover().within(() => {
      cy.findByText(/No/i).click();
    });

    // Check setting has persisted
    cy.reload();
    getUnfoldJsonContent().findByText(/No/i);

    // Sync database
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Sync database schema now/i).click();
    cy.wait("@sync_schema");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sync triggered!");

    // Check json field is not unfolded
    cy.visit(`/admin/datamodel/database/${WRITABLE_DB_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Many Data Types/i).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/json.a/i).should("not.exist");
  });
});
