const { H } = cy;
import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DATA_MODEL_PERMISSION_INDEX = 3;

describe("scenarios > admin > permissions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.intercept("PUT", "/api/table/*").as("tableUpdate");
    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept(
      "GET",
      "/api/table/*/query_metadata?include_sensitive_fields=true&include_editable_data_model=true",
    ).as("tableMetadataFetch");
  });

  it("allows data model permission for a table in database", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change permission
    H.modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Granular");
    H.modifyPermission("Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    savePermissionsGraph();

    // Assert the permission has changed
    H.assertPermissionForItem("Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    // Check limited access as a non-admin user
    cy.signInAsNormalUser();
    cy.visit("/");

    // Go to the admin settings
    cy.icon("gear").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();

    // Assert the Data Model page state
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Table Metadata");
    H.DataModel.TablePicker.getTable("Orders").click();
    cy.wait("@tableMetadataFetch");

    // Update the table name
    H.DataModel.TableSection.getNameInput()
      .should("have.value", "Orders")
      .clear()
      .should("have.value", "")
      .type("Changed Name")
      .blur();
    cy.wait("@tableUpdate");
    cy.wait("@tableMetadataFetch");

    H.undoToast().should("contain.text", "Table name updated");

    // Update the table visibility
    H.DataModel.TablePicker.getTable("Changed Name")
      .button("Hide table")
      .click();
    H.DataModel.TablePicker.getTable("Changed Name")
      .button("Hide table")
      .should("not.exist");
    H.DataModel.TablePicker.getTable("Changed Name")
      .button("Unhide table")
      .should("be.visible");
  });

  it("allows changing data model permission for an entire database", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change data model permission
    H.modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Yes");

    savePermissionsGraph();

    // Assert the permission has changed
    H.assertPermissionForItem("All Users", DATA_MODEL_PERMISSION_INDEX, "Yes");

    // Check limited access as a non-admin user
    cy.signInAsNormalUser();
    cy.visit("/");

    // Go to the admin settings
    cy.icon("gear").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();

    // Assert the Data Model page state
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Table Metadata");
    H.DataModel.TablePicker.getTables().should("have.length", 8);
    H.DataModel.TablePicker.getTable("Accounts").should("be.visible");
    H.DataModel.TablePicker.getTable("Analytic Events").should("be.visible");
    H.DataModel.TablePicker.getTable("Feedback").should("be.visible");
    H.DataModel.TablePicker.getTable("Invoices").should("be.visible");
    H.DataModel.TablePicker.getTable("Orders").should("be.visible");
    H.DataModel.TablePicker.getTable("People").should("be.visible");
    H.DataModel.TablePicker.getTable("Products").should("be.visible");
    H.DataModel.TablePicker.getTable("Reviews").should("be.visible");
  });

  it("shows `Field access denied` for foreign keys from tables user does not have access to (metabase#21762)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change data model permission
    H.modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Granular");
    H.modifyPermission("Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    savePermissionsGraph();

    // Check limited access as a non-admin user
    cy.signIn("none");
    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.USER_ID,
    });

    // Look at foreign key from table the user does not have access to
    H.DataModel.FieldSection.getSemanticTypeFkTarget()
      .should("have.attr", "placeholder", "Field access denied")
      .and("have.value", "");
  });
});

function savePermissionsGraph() {
  cy.button("Save changes").click();
  H.modal().within(() => {
    cy.findByText("Save permissions?");
    cy.findByText("Are you sure you want to do this?");
    cy.button("Yes").click();
  });
}
