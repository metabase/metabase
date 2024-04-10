import {
  restore,
  modal,
  assertPermissionTable,
  modifyPermission,
  selectSidebarItem,
} from "e2e/support/helpers";

const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describe("scenarios > admin > permissions > create queries > query builder only", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'query builder only' in group view", () => {
    cy.visit("/admin/permissions");

    selectSidebarItem("collection");

    assertPermissionTable([["Sample Database", "Can view", "No"]]);

    // Drill down to tables permissions
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

    // Navigate back
    selectSidebarItem("collection");

    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    assertPermissionTable([
      ["Sample Database", "Can view", "Query builder only"],
    ]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    const finalTablePermissions = [
      ["Accounts", "Can view", "Query builder only"],
      ["Analytic Events", "Can view", "Query builder only"],
      ["Feedback", "Can view", "Query builder only"],
      ["Invoices", "Can view", "Query builder only"],
      ["Orders", "Can view", "Query builder only"],
      ["People", "Can view", "Query builder only"],
      ["Products", "Can view", "Query builder only"],
      ["Reviews", "Can view", "Query builder only"],
    ];

    assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will now be able to read or write native queries for Sample Database.",
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

    // User should have the option to change permissions back to query builder only at the database level
    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );
  });

  it("should set entire database to 'query builder only' if a table is changed to it while db is 'query builder only'", () => {
    cy.visit("/admin/permissions");

    selectSidebarItem("collection");

    assertPermissionTable([["Sample Database", "Can view", "No"]]);

    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

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

    modifyPermission(
      "Orders",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    const finalTablePermissions = [
      ["Accounts", "Can view", "Query builder only"],
      ["Analytic Events", "Can view", "Query builder only"],
      ["Feedback", "Can view", "Query builder only"],
      ["Invoices", "Can view", "Query builder only"],
      ["Orders", "Can view", "Query builder only"],
      ["People", "Can view", "Query builder only"],
      ["Products", "Can view", "Query builder only"],
      ["Reviews", "Can view", "Query builder only"],
    ];

    assertPermissionTable(finalTablePermissions);

    // Navigate back
    selectSidebarItem("collection");
    assertPermissionTable([
      ["Sample Database", "Can view", "Query builder only"],
    ]);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will now be able to read or write native queries for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    assertPermissionTable(finalTablePermissions);
  });

  it("should allow setting create queries to 'query builder only' in group view", () => {
    cy.visit("/admin/permissions");

    selectSidebarItem("collection");

    assertPermissionTable([["Sample Database", "Can view", "No"]]);

    // Drill down to tables permissions
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

    // Navigate back
    selectSidebarItem("collection");

    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    assertPermissionTable([
      ["Sample Database", "Can view", "Query builder only"],
    ]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    const finalTablePermissions = [
      ["Accounts", "Can view", "Query builder only"],
      ["Analytic Events", "Can view", "Query builder only"],
      ["Feedback", "Can view", "Query builder only"],
      ["Invoices", "Can view", "Query builder only"],
      ["Orders", "Can view", "Query builder only"],
      ["People", "Can view", "Query builder only"],
      ["Products", "Can view", "Query builder only"],
      ["Reviews", "Can view", "Query builder only"],
    ];

    assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will now be able to read or write native queries for Sample Database.",
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

    // User should have the option to change permissions back to query builder only at the database level
    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );
  });

  it("should allow setting create queries to 'query builder only' in database view", () => {
    cy.visit("/admin/permissions/");

    cy.get("label").contains("Databases").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a database to see group permissions");

    selectSidebarItem("Sample Database");

    assertPermissionTable([
      ["Administrators", "Can view", "Query builder and native"],
      ["All Users", "Can view", "No"],
      ["collection", "Can view", "No"],
      ["data", "Can view", "Query builder and native"],
      ["nosql", "Can view", "Query builder only"],
      ["readonly", "Can view", "No"],
    ]);

    modifyPermission(
      "readonly",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    const finalPermissions = [
      ["Administrators", "Can view", "Query builder and native"],
      ["All Users", "Can view", "No"],
      ["collection", "Can view", "No"],
      ["data", "Can view", "Query builder and native"],
      ["nosql", "Can view", "Query builder only"],
      ["readonly", "Can view", "Query builder only"],
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
        "readonly will now be able to read or write native queries for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    assertPermissionTable(finalPermissions);
  });
});
