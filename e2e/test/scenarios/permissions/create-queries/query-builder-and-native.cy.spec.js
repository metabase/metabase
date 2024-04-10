import {
  restore,
  modal,
  assertPermissionTable,
  modifyPermission,
  selectPermissionRow,
  popover,
  selectSidebarItem,
} from "e2e/support/helpers";

const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describe("scenarios > admin > permissions > create queries > query builder and native", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'query builder and native' in group view", () => {
    cy.visit("/admin/permissions");

    selectSidebarItem("collection");

    assertPermissionTable([
      ["Sample Database", "Can view", "No", "No", "No", "No"],
    ]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    assertPermissionTable([
      ["Accounts", "Can view", "No", "No", "No", "No"],
      ["Analytic Events", "Can view", "No", "No", "No", "No"],
      ["Feedback", "Can view", "No", "No", "No", "No"],
      ["Invoices", "Can view", "No", "No", "No", "No"],
      ["Orders", "Can view", "No", "No", "No", "No"],
      ["People", "Can view", "No", "No", "No", "No"],
      ["Products", "Can view", "No", "No", "No", "No"],
      ["Reviews", "Can view", "No", "No", "No", "No"],
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

    assertPermissionTable([
      [
        "Sample Database",
        "Can view",
        "Query builder and native",
        "No",
        "No",
        "No",
      ],
    ]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    const finalTablePermissions = [
      ["Accounts", "Can view", "Query builder and native", "No", "No", "No"],
      [
        "Analytic Events",
        "Can view",
        "Query builder and native",
        "No",
        "No",
        "No",
      ],
      ["Feedback", "Can view", "Query builder and native", "No", "No", "No"],
      ["Invoices", "Can view", "Query builder and native", "No", "No", "No"],
      ["Orders", "Can view", "Query builder and native", "No", "No", "No"],
      ["People", "Can view", "Query builder and native", "No", "No", "No"],
      ["Products", "Can view", "Query builder and native", "No", "No", "No"],
      ["Reviews", "Can view", "Query builder and native", "No", "No", "No"],
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
      [
        "Administrators",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "Yes",
        "Yes",
      ],
      ["All Users", "Can view", "No", "1 million rows", "No", "No"],
      ["collection", "Can view", "No", "No", "No", "No"],
      ["data", "Can view", "Query builder and native", "No", "No", "No"],
      ["nosql", "Can view", "Query builder only", "No", "No", "No"],
      ["readonly", "Can view", "No", "No", "No", "No"],
    ]);

    modifyPermission(
      "readonly",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    const finalPermissions = [
      [
        "Administrators",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "Yes",
        "Yes",
      ],
      ["All Users", "Can view", "No", "1 million rows", "No", "No"],
      ["collection", "Can view", "No", "No", "No", "No"],
      ["data", "Can view", "Query builder and native", "No", "No", "No"],
      ["nosql", "Can view", "Query builder only", "No", "No", "No"],
      ["readonly", "Can view", "Query builder and native", "No", "No", "No"],
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
