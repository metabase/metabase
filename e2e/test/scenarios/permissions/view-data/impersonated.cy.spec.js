import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  createTestRoles,
  selectPermissionRow,
  describeEE,
  getPermissionRowPermissions,
  modal,
  setTokenFeatures,
  popover,
  modifyPermission,
  assertPermissionTable,
  restore,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const DATA_ACCESS_PERMISSION_INDEX = 0;

describeEE("scenarios > admin > permissions > view data > impersonated", () => {
  beforeEach(() => {
    restore("postgres-12");
    createTestRoles({ type: "postgres" });
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should allow saving 'impersonated' permissions", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    // Check there is no Impersonated option on H2
    selectPermissionRow("Sample Database", DATA_ACCESS_PERMISSION_INDEX);
    popover().should("not.contain", "Impersonated");

    // Set impersonated access on Postgres database
    modifyPermission(
      "QA Postgres12",
      DATA_ACCESS_PERMISSION_INDEX,
      "Impersonated",
    );

    selectImpersonatedAttribute("role");
    saveImpersonationSettings();
    savePermissions();

    assertPermissionTable([
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No"],
      ["QA Postgres12", "Impersonated", "No", "1 million rows", "No", "No"],
    ]);

    // Checking it shows the right state on the tables level
    cy.get("main").findByText("QA Postgres12").click();

    assertPermissionTable(
      [
        "Accounts",
        "Analytic Events",
        "Feedback",
        "Invoices",
        "Orders",
        "People",
        "Products",
        "Reviews",
      ].map(tableName => [
        tableName,
        "Impersonated",
        "No",
        "1 million rows",
        "No",
        "No",
      ]),
    );

    // Return back to the database view
    cy.get("main").findByText("All Users group").click();

    // Edit impersonated permission
    modifyPermission(
      "QA Postgres12",
      DATA_ACCESS_PERMISSION_INDEX,
      "Edit Impersonated",
    );

    selectImpersonatedAttribute("attr_uid");
    saveImpersonationSettings();
    savePermissions();

    assertPermissionTable([
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No"],
      ["QA Postgres12", "Impersonated", "No", "1 million rows", "No", "No"],
    ]);
  });

  it("should warns when All Users group has 'impersonated' access and the target group has unrestricted access", () => {
    cy.visit(`/admin/permissions/data/group/${COLLECTION_GROUP}`);

    modifyPermission(
      "QA Postgres12",
      DATA_ACCESS_PERMISSION_INDEX,
      "Impersonated",
    );

    // Warns that All Users group has greater access
    cy.findByRole("dialog").within(() => {
      cy.findByText(
        'Revoke access even though "All Users" has greater access?',
      );

      cy.findByText("Revoke access").click();
    });

    selectImpersonatedAttribute("role");
    saveImpersonationSettings();
    savePermissions();

    getPermissionRowPermissions("QA Postgres12")
      .eq(DATA_ACCESS_PERMISSION_INDEX)
      .findByLabelText("warning icon")
      .realHover();

    popover().findByText(
      'The "All Users" group has a higher level of access than this, which will override this setting. You should limit or revoke the "All Users" group\'s access to this item.',
    );
  });

  it("allows switching to the granular access and update table permissions", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    modifyPermission(
      "QA Postgres12",
      DATA_ACCESS_PERMISSION_INDEX,
      "Impersonated",
    );

    selectImpersonatedAttribute("role");
    saveImpersonationSettings();
    savePermissions();

    modifyPermission("QA Postgres12", DATA_ACCESS_PERMISSION_INDEX, "Granular");

    // Resets table permissions from Impersonated to Can view
    assertPermissionTable(
      [
        "Accounts",
        "Analytic Events",
        "Feedback",
        "Invoices",
        "Orders",
        "People",
        "Products",
        "Reviews",
      ].map(tableName => [
        tableName,
        "Can view",
        "No",
        "1 million rows",
        "No",
        "No",
      ]),
    );
    // Return back to the database view
    cy.get("main").findByText("All Users group").click();

    // On database level it got reset to Can view too
    assertPermissionTable([
      ["Sample Database", "Can view", "No", "1 million rows", "No", "No"],
      ["QA Postgres12", "Can view", "No", "1 million rows", "No", "No"],
    ]);
  });

  it("impersonation modal should be positioned behind the page leave confirmation modal", () => {
    // Try leaving the page
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    modifyPermission(
      "QA Postgres12",
      DATA_ACCESS_PERMISSION_INDEX,
      "Impersonated",
    );

    selectImpersonatedAttribute("role");
    saveImpersonationSettings();

    modifyPermission(
      "QA Postgres12",
      DATA_ACCESS_PERMISSION_INDEX,
      "Edit Impersonated",
    );

    cy.findByRole("dialog").findByText("Edit settings").click();

    // Page leave confirmation should be on top
    modal()
      .as("leaveConfirmation")
      .findByText("Discard your changes?")
      .should("be.visible");

    // Cancel
    cy.get("@leaveConfirmation").findByText("Cancel").click();

    // Ensure the impersonation modal is still open
    cy.findByRole("dialog")
      .findByText("Map a user attribute to database roles")
      .should("be.visible");

    // Go to settings
    cy.findByRole("dialog").findByText("Edit settings").click();
    cy.get("@leaveConfirmation").findByText("Discard changes").click();

    cy.focused().should("have.attr", "placeholder", "username");
  });
});

function savePermissions() {
  cy.findByTestId("edit-bar").button("Save changes").click();
  cy.findByRole("dialog").findByText("Yes").click();
  cy.findByTestId("edit-bar").should("not.exist");
}

function selectImpersonatedAttribute(attribute) {
  cy.findByRole("dialog").within(() => {
    cy.findByTestId("select-button").click();
  });

  popover().findByText(attribute).click();
}

function saveImpersonationSettings() {
  cy.findByRole("dialog").findByText("Save").click();
}
