import {
  restore,
  modal,
  assertPermissionTable,
  modifyPermission,
  selectPermissionRow,
  popover,
  selectSidebarItem,
} from "e2e/support/helpers";

const NATIVE_QUERIES_PERMISSION_INDEX = 0;

describe("scenarios > admin > permissions > create queries > query builder and native", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'query builder and native' in group view", () => {
    cy.visit("/admin/permissions");

    selectSidebarItem("collection");

    assertPermissionTable([["Sample Database", "No"]]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    assertPermissionTable([
      ["Accounts", "No"],
      ["Analytic Events", "No"],
      ["Feedback", "No"],
      ["Invoices", "No"],
      ["Orders", "No"],
      ["People", "No"],
      ["Products", "No"],
      ["Reviews", "No"],
    ]);

    // Test that query builder and native is not an option when it's not selected at table level
    selectPermissionRow("Orders", NATIVE_QUERIES_PERMISSION_INDEX);
    popover().should("not.contain", "Query builder and native");

    // Navigate back
    selectSidebarItem("collection");

    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    assertPermissionTable([["Sample Database", "Query builder and native"]]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    const finalTablePermissions = [
      ["Accounts", "Query builder and native"],
      ["Analytic Events", "Query builder and native"],
      ["Feedback", "Query builder and native"],
      ["Invoices", "Query builder and native"],
      ["Orders", "Query builder and native"],
      ["People", "Query builder and native"],
      ["Products", "Query builder and native"],
      ["Reviews", "Query builder and native"],
    ];

    assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will be able to use the query builder and write native queries for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    assertPermissionTable(finalTablePermissions);

    // After saving permissions, user should be able to make further edits without refreshing the page
    // metabase#37811
    selectSidebarItem("data");

    modifyPermission("Sample Database", NATIVE_QUERIES_PERMISSION_INDEX, "No");

    cy.button("Refresh the page").should("not.exist");

    // User should have the option to change permissions back to query builder and native at the database level
    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );
  });

  it("should allow setting create queries to 'query builder and native' in database view", () => {
    cy.visit("/admin/permissions/");

    cy.get("label").contains("Databases").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a database to see group permissions");

    selectSidebarItem("Sample Database");

    assertPermissionTable([
      ["Administrators", "Query builder and native"],
      ["All Users", "No"],
      ["collection", "No"],
      ["data", "Query builder and native"],
      ["nosql", "Query builder only"],
      ["readonly", "No"],
    ]);

    modifyPermission(
      "readonly",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    const finalPermissions = [
      ["Administrators", "Query builder and native"],
      ["All Users", "No"],
      ["collection", "No"],
      ["data", "Query builder and native"],
      ["nosql", "Query builder only"],
      ["readonly", "Query builder and native"],
    ];
    assertPermissionTable(finalPermissions);

    selectSidebarItem("Orders");

    assertPermissionTable(finalPermissions);

    // Navigate back
    cy.get("a").contains("Sample Database").click();

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "readonly will be able to use the query builder and write native queries for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    assertPermissionTable(finalPermissions);
  });
});
