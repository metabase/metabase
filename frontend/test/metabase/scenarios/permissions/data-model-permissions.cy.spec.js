import {
  restore,
  modal,
  describeEE,
  assertPermissionForItem,
  modifyPermission,
} from "__support__/e2e/helpers";

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DATA_MODEL_PERMISSION_INDEX = 3;

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/table/*").as("tableUpdate");
    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept(
      "GET",
      "/api/table/2/query_metadata?include_sensitive_fields=true&include_editable_data_model=true",
    ).as("tableMetadataFetch");
  });

  it("allows data model permission for a table in database", () => {
    cy.visit("/admin/permissions/data/database/1");

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
    cy.findByText("Admin settings").click();

    // Assert the Data Model page state
    cy.findByText("Data Model");
    cy.findByText("1 Queryable Table");
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

    cy.findByText("Updated Table display_name");

    // Update the table visibility
    cy.findByText("Hidden").click();
    cy.findByText("1 Hidden Table");
  });

  it("allows changing data model permission for an entire database", () => {
    cy.visit("/admin/permissions/data/database/1");

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
    cy.findByText("Admin settings").click();

    // Assert the Data Model page state
    cy.findByText("Data Model");
    cy.findByText("4 Queryable Tables");
    cy.findByText("Orders");
    cy.findByText("Products");
    cy.findByText("People");
    cy.findByText("Reviews");
  });

  it("shows `Field access denied` for foreign keys from tables user does not have access to (metabase#21762)", () => {
    cy.visit("/admin/permissions/data/database/1");

    // Change data model permission
    modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Granular");
    modifyPermission("Orders", DATA_MODEL_PERMISSION_INDEX, "Yes");
    modifyPermission("Orders", DATA_ACCESS_PERMISSION_INDEX, "Unrestricted");
    cy.button("Change").click();

    savePermissionsGraph();

    // Check limited access as a non-admin user
    cy.signIn("none");
    cy.visit("/admin/datamodel/database/1/table/2");

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
