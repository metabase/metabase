import {
  restore,
  modal,
  describeEE,
  assertPermissionTable,
  assertPermissionForItem,
  modifyPermission,
} from "__support__/e2e/cypress";

const DATA_ACCESS_PERMISSION_INDEX = 0;
const DATA_MODEL_PERMISSION_INDEX = 3;

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows changing data model permission for a database", () => {
    cy.visit("/admin/permissions/data/database/1");

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Unrestricted");
    modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Edit");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionForItem("All Users", DATA_MODEL_PERMISSION_INDEX, "Edit");
  });

  it("allows changing data model permission for a table", () => {
    cy.visit("/admin/permissions/data/database/1/table/1");

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Unrestricted");

    modal().within(() => {
      cy.findByText("Change access to this database to limited?");
      cy.button("Change").click();
    });

    modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Edit");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionForItem("All Users", DATA_MODEL_PERMISSION_INDEX, "Edit");

    // Shows granular data model permission on the database level
    cy.visit("/admin/permissions/data/database/1");

    assertPermissionForItem(
      "All Users",
      DATA_MODEL_PERMISSION_INDEX,
      "Granular",
    );
  });

  it("sets the data model permission to `No` when the data access permission is revoked", () => {
    cy.visit("/admin/permissions/data/database/1");
    const groupName = "data";

    modifyPermission(groupName, DATA_MODEL_PERMISSION_INDEX, "Edit");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionTable([
      ["Administrators", "Unrestricted", "Yes", "1 million rows"],
      ["All Users", "No self-service", "No", "No"],
      ["collection", "No self-service", "No", "No"],
      ["data", "Unrestricted", "Yes", "1 million rows"],
      ["nosql", "Unrestricted", "No", "No"],
      ["readonly", "No self-service", "No", "No"],
    ]);

    modifyPermission(
      groupName,
      DATA_ACCESS_PERMISSION_INDEX,
      "No self-service",
    );

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.findByText("Are you sure you want to do this?");
      cy.button("Yes").click();
    });

    assertPermissionForItem("All Users", DATA_MODEL_PERMISSION_INDEX, "No");
  });
});
