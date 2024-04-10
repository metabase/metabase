import {
  assertPermissionTable,
  selectSidebarItem,
  modal,
  restore,
  modifyPermission,
} from "e2e/support/helpers";

const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describe("scenarios > admin > permissions > create queries > no", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'no' in group view", () => {
    cy.visit("/admin/permissions/data");

    selectSidebarItem("data");

    modifyPermission("Sample Database", NATIVE_QUERIES_PERMISSION_INDEX, "No");

    assertPermissionTable([["Sample Database", "Can view", "No"]]);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    assertPermissionTable([["Sample Database", "Can view", "No"]]);

    cy.findByTextEnsureVisible("Sample Database").click();

    assertPermissionTable([
      ["Accounts", "Can view", "No"],
      ["Analytic Events", "Can view", "No"],
      ["Feedback", "Can view", "No"],
      ["Invoices", "Can view", "No"],
      ["Orders", "Can view", "No"],
      ["People", "Can view", "No"],
      ["Products", "Can view", "No"],
      ["Reviews", "Can view", "No"],
    ]);
  });
});
