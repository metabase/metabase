import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  assertPermissionTable,
  modal,
  modifyPermission,
  popover,
  restore,
  selectPermissionRow,
  selectSidebarItem,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

const NATIVE_QUERIES_PERMISSION_INDEX = 0;

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
      ["Accounts", "Query builder and native"],
      ["Analytic Events", "Query builder and native"],
      ["Feedback", "Query builder and native"],
      ["Invoices", "Query builder and native"],
      ["Orders", "Query builder and native"],
      ["People", "Query builder and native"],
      ["Products", "Query builder and native"],
      ["Reviews", "Query builder and native"],
    ]);

    // should allow setting a granular value for one table
    modifyPermission("Orders", NATIVE_QUERIES_PERMISSION_INDEX, "No");

    modal().within(() => {
      cy.findByText("Change access to this database to “Granular”?");
      cy.findByText("Change").click();
    });

    // should also remove native permissions for all other tables
    assertPermissionTable([
      ["Accounts", "Query builder and native"],
      ["Analytic Events", "Query builder and native"],
      ["Feedback", "Query builder and native"],
      ["Invoices", "Query builder and native"],
      ["Orders", "No"],
      ["People", "Query builder and native"],
      ["Products", "Query builder and native"],
      ["Reviews", "Query builder and native"],
    ]);

    // should allow 'query builder and native' as a granular permissions permission options
    selectPermissionRow("Orders", NATIVE_QUERIES_PERMISSION_INDEX);
    popover().should("contain", "Query builder and native");

    // should have db set to granular
    selectSidebarItem("All Users");
    assertPermissionTable([["Sample Database", "Granular"]]);

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
      "Query builder and native",
    );
    selectSidebarItem("All Users");
    assertPermissionTable([["Sample Database", "Query builder and native"]]);
  });
});

describe("scenarios > admin > permissions > create queries > no", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'no' in group view", () => {
    cy.visit("/admin/permissions/data");
    selectSidebarItem("data");

    modifyPermission("Sample Database", NATIVE_QUERIES_PERMISSION_INDEX, "No");

    assertPermissionTable([["Sample Database", "No"]]);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    assertPermissionTable([["Sample Database", "No"]]);

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
  });
});

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

    // test that query builder and native is an option when it's not selected at table level
    selectPermissionRow("Orders", NATIVE_QUERIES_PERMISSION_INDEX);
    popover().should("contain", "Query builder and native");

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

describe("scenarios > admin > permissions > create queries > query builder only", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'query builder only' in group view", () => {
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

    // Navigate back
    selectSidebarItem("collection");

    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    assertPermissionTable([["Sample Database", "Query builder only"]]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    const finalTablePermissions = [
      ["Accounts", "Query builder only"],
      ["Analytic Events", "Query builder only"],
      ["Feedback", "Query builder only"],
      ["Invoices", "Query builder only"],
      ["Orders", "Query builder only"],
      ["People", "Query builder only"],
      ["Products", "Query builder only"],
      ["Reviews", "Query builder only"],
    ];

    assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will only be able to use the query builder for Sample Database.",
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

  it("should allow setting create queries to 'query builder only' in group view", () => {
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

    // Navigate back
    selectSidebarItem("collection");

    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    assertPermissionTable([["Sample Database", "Query builder only"]]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    const finalTablePermissions = [
      ["Accounts", "Query builder only"],
      ["Analytic Events", "Query builder only"],
      ["Feedback", "Query builder only"],
      ["Invoices", "Query builder only"],
      ["Orders", "Query builder only"],
      ["People", "Query builder only"],
      ["Products", "Query builder only"],
      ["Reviews", "Query builder only"],
    ];

    assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will only be able to use the query builder for Sample Database.",
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
      "Query builder only",
    );

    const finalPermissions = [
      ["Administrators", "Query builder and native"],
      ["All Users", "No"],
      ["collection", "No"],
      ["data", "Query builder and native"],
      ["nosql", "Query builder only"],
      ["readonly", "Query builder only"],
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
        "readonly will only be able to use the query builder for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    assertPermissionTable(finalPermissions);
  });
});
