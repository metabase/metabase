import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  assertPermissionTable,
  selectSidebarItem,
  popover,
  selectPermissionRow,
  modal,
  restore,
  modifyPermission,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describe("scenarios > admin > permissions > create queries > granular", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow configuring granular permissions in group view", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    // should allow choosing granular option at the db level
    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Granular",
    );

    assertPermissionTable([
      ["Accounts", "Can view", "Query builder and native"],
      ["Analytic Events", "Can view", "Query builder and native"],
      ["Feedback", "Can view", "Query builder and native"],
      ["Invoices", "Can view", "Query builder and native"],
      ["Orders", "Can view", "Query builder and native"],
      ["People", "Can view", "Query builder and native"],
      ["Products", "Can view", "Query builder and native"],
      ["Reviews", "Can view", "Query builder and native"],
    ]);

    // should allow setting a granular value for one table
    modifyPermission("Orders", NATIVE_QUERIES_PERMISSION_INDEX, "No");

    // should alos remove native permissions for all other tables
    assertPermissionTable([
      ["Accounts", "Can view", "Query builder only"],
      ["Analytic Events", "Can view", "Query builder only"],
      ["Feedback", "Can view", "Query builder only"],
      ["Invoices", "Can view", "Query builder only"],
      ["Orders", "Can view", "No"],
      ["People", "Can view", "Query builder only"],
      ["Products", "Can view", "Query builder only"],
      ["Reviews", "Can view", "Query builder only"],
    ]);

    // should not allow 'query builder and native' as a granular permissions permission options
    selectPermissionRow("Orders", NATIVE_QUERIES_PERMISSION_INDEX);
    popover().should("not.contain", "Query builder and native");

    // should have db set to granular
    selectSidebarItem("All Users");
    assertPermissionTable([["Sample Database", "Can view", "Granular"]]);

    // should allow saving
    cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");
    cy.button("Save changes").click();
    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    cy.wait("@saveGraph").then(({ response }) => {
      expect(response.statusCode).to.equal(200);
    });

    // should infer value at db level if the tables are all made the same value
    cy.findByTextEnsureVisible("Sample Database").click();
    modifyPermission(
      "Orders",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );
    selectSidebarItem("All Users");
    assertPermissionTable([
      ["Sample Database", "Can view", "Query builder only"],
    ]);
  });
});
