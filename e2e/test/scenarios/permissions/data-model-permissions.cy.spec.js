import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  modal,
  describeEE,
  assertPermissionForItem,
  modifyPermission,
  setTokenFeatures,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DATA_MODEL_PERMISSION_INDEX = 3;

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

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
    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Granular");
    modifyPermission("Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    savePermissionsGraph();

    // Assert the permission has changed
    assertPermissionForItem("Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    // Check limited access as a non-admin user
    cy.signInAsNormalUser();
    cy.visit("/");

    // Go to the admin settings
    cy.icon("gear").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();

    // Assert the Data Model page state
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Table Metadata");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1 Queryable Table");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();

    cy.wait("@tableMetadataFetch");

    // Update the table name
    cy.get("[name=display_name]")
      .should("have.value", "Orders")
      .clear()
      .should("have.value", "")
      .type("Changed Name")
      .blur();
    cy.wait("@tableUpdate");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Updated Table display_name");

    // Update the table visibility
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Hidden").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1 Hidden Table");
  });

  it("allows changing data model permission for an entire database", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change data model permission
    modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Yes");

    savePermissionsGraph();

    // Assert the permission has changed
    assertPermissionForItem("All Users", DATA_MODEL_PERMISSION_INDEX, "Yes");

    // Check limited access as a non-admin user
    cy.signInAsNormalUser();
    cy.visit("/");

    // Go to the admin settings
    cy.icon("gear").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();

    // Assert the Data Model page state
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Table Metadata");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("4 Queryable Tables");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviews");
  });

  it("shows `Field access denied` for foreign keys from tables user does not have access to (metabase#21762)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    // Change data model permission
    modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Granular");
    modifyPermission("Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");

    savePermissionsGraph();

    // Check limited access as a non-admin user
    cy.signIn("none");
    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
    );

    // Find foreign key from table the user does not have access to
    cy.findByTestId("column-USER_ID").within(() => {
      cy.findByText("Field access denied");
    });
  });
});

function savePermissionsGraph() {
  cy.button("Save changes").click();
  modal().within(() => {
    cy.findByText("Save permissions?");
    cy.findByText("Are you sure you want to do this?");
    cy.button("Yes").click();
  });
}
