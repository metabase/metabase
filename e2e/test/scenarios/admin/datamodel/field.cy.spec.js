import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  withDatabase,
  visitAlias,
  popover,
  resetTestTable,
  openTable,
  resyncDatabase,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > field", () => {
  beforeEach(() => {
    restore();
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

  describe("Formatting", () => {
    it("should allow you to change field formatting", () => {
      visitAlias("@ORDERS_QUANTITY_URL");
      cy.findByRole("link", { name: "Formatting" }).click();
      cy.findByLabelText("Style").click();
      popover().findByText("Percent").click();
      cy.wait("@fieldUpdate");
      cy.findByRole("list", { name: "undo-list" })
        .findByText("Updated Quantity")
        .should("exist");
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

    it("allows 'Custom mapping' null values", () => {
      const dbId = 2;
      const remappedNullValue = "nothin";

      restore("withSqlite");
      cy.signInAsAdmin();

      withDatabase(
        dbId,
        ({ NUMBER_WITH_NULLS: { NUM }, NUMBER_WITH_NULLS_ID }) => {
          cy.request("GET", `/api/database/${dbId}/schemas`).then(
            ({ body }) => {
              const [schema] = body;

              cy.visit(
                `/admin/datamodel/database/${dbId}/schema/${dbId}:${schema}/table/${NUMBER_WITH_NULLS_ID}/field/${NUM}/general`,
              );
            },
          );

          cy.log("Change `null` to custom mapping");
          cy.findByRole("heading", { name: "Display values" })
            .closest("section")
            .findByText("Use original value")
            .click();
          popover().findByText("Custom mapping").click();

          cy.findByDisplayValue("null").clear().type(remappedNullValue);
          cy.button("Save").click();
          cy.button("Saved!").should("be.visible");

          cy.log("Make sure custom mapping appears in QB");
          openTable({ database: dbId, table: NUMBER_WITH_NULLS_ID });
          cy.get("[data-testid=cellData]").should("contain", remappedNullValue);
        },
      );
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
    restore("postgres-writable");
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
