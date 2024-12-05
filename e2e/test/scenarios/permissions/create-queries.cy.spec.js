import { H } from "e2e/support";
import { USER_GROUPS } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

const NATIVE_QUERIES_PERMISSION_INDEX = 0;

describe("scenarios > admin > permissions > create queries > granular", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow configuring granular permissions in group view", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    // should allow choosing granular option at the db level
    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Granular",
    );

    H.assertPermissionTable([
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
    H.modifyPermission("Orders", NATIVE_QUERIES_PERMISSION_INDEX, "No");

    H.modal().within(() => {
      cy.findByText("Change access to this database to “Granular”?");
      cy.findByText("Change").click();
    });

    // should also remove native permissions for all other tables
    H.assertPermissionTable([
      ["Accounts", "Query builder only"],
      ["Analytic Events", "Query builder only"],
      ["Feedback", "Query builder only"],
      ["Invoices", "Query builder only"],
      ["Orders", "No"],
      ["People", "Query builder only"],
      ["Products", "Query builder only"],
      ["Reviews", "Query builder only"],
    ]);

    // should not allow 'query builder and native' as a granular permissions permission options
    H.selectPermissionRow("Orders", NATIVE_QUERIES_PERMISSION_INDEX);
    H.popover().should("not.contain", "Query builder and native");

    // should have db set to granular
    H.selectSidebarItem("All Users");
    H.assertPermissionTable([["Sample Database", "Granular"]]);

    // should allow saving
    cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");
    cy.button("Save changes").click();
    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    cy.wait("@saveGraph").then(({ response }) => {
      expect(response.statusCode).to.equal(200);
    });

    // should infer value at db level if the tables are all made the same value
    cy.findByTextEnsureVisible("Sample Database").click();
    H.modifyPermission(
      "Orders",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );
    H.selectSidebarItem("All Users");
    H.assertPermissionTable([["Sample Database", "Query builder only"]]);
  });
});

describe("scenarios > admin > permissions > create queries > no", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'no' in group view", () => {
    cy.visit("/admin/permissions/data");
    H.selectSidebarItem("data");

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "No",
    );

    H.assertPermissionTable([["Sample Database", "No"]]);

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    H.assertPermissionTable([["Sample Database", "No"]]);

    cy.findByTextEnsureVisible("Sample Database").click();

    H.assertPermissionTable([
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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'query builder and native' in group view", () => {
    cy.visit("/admin/permissions");
    H.selectSidebarItem("collection");

    H.assertPermissionTable([["Sample Database", "No"]]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    H.assertPermissionTable([
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
    H.selectPermissionRow("Orders", NATIVE_QUERIES_PERMISSION_INDEX);
    H.popover().should("not.contain", "Query builder and native");

    // Navigate back
    H.selectSidebarItem("collection");

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    H.assertPermissionTable([["Sample Database", "Query builder and native"]]);

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

    H.assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will be able to use the query builder and write native queries for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    H.assertPermissionTable(finalTablePermissions);

    // After saving permissions, user should be able to make further edits without refreshing the page
    // metabase#37811
    H.selectSidebarItem("data");

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "No",
    );

    cy.button("Refresh the page").should("not.exist");

    // User should have the option to change permissions back to query builder and native at the database level
    H.modifyPermission(
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

    H.selectSidebarItem("Sample Database");

    H.assertPermissionTable([
      ["Administrators", "Query builder and native"],
      ["All Users", "No"],
      ["collection", "No"],
      ["data", "Query builder and native"],
      ["nosql", "Query builder only"],
      ["readonly", "No"],
    ]);

    H.modifyPermission(
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
    H.assertPermissionTable(finalPermissions);

    H.selectSidebarItem("Orders");

    H.assertPermissionTable(finalPermissions);

    // Navigate back
    cy.get("a").contains("Sample Database").click();

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "readonly will be able to use the query builder and write native queries for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    H.assertPermissionTable(finalPermissions);
  });
});

describe("scenarios > admin > permissions > create queries > query builder only", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow setting create queries to 'query builder only' in group view", () => {
    cy.visit("/admin/permissions");
    H.selectSidebarItem("collection");

    H.assertPermissionTable([["Sample Database", "No"]]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    H.assertPermissionTable([
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
    H.selectSidebarItem("collection");

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    H.assertPermissionTable([["Sample Database", "Query builder only"]]);

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

    H.assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will only be able to use the query builder for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    H.assertPermissionTable(finalTablePermissions);

    // After saving permissions, user should be able to make further edits without refreshing the page
    // metabase#37811
    H.selectSidebarItem("data");

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "No",
    );

    cy.button("Refresh the page").should("not.exist");

    // User should have the option to change permissions back to query builder only at the database level
    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );
  });

  it("should set entire database to 'query builder only' if a table is changed to it while db is 'query builder only'", () => {
    cy.visit("/admin/permissions");
    H.selectSidebarItem("collection");

    H.assertPermissionTable([["Sample Database", "No"]]);

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    H.assertPermissionTable([
      ["Accounts", "Query builder and native"],
      ["Analytic Events", "Query builder and native"],
      ["Feedback", "Query builder and native"],
      ["Invoices", "Query builder and native"],
      ["Orders", "Query builder and native"],
      ["People", "Query builder and native"],
      ["Products", "Query builder and native"],
      ["Reviews", "Query builder and native"],
    ]);

    H.modifyPermission(
      "Orders",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    H.modal().within(() => {
      cy.findByText("Change access to this database to “Granular”?");
      cy.findByText("Change").click();
    });

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

    H.assertPermissionTable(finalTablePermissions);

    // Navigate back
    H.selectSidebarItem("collection");
    H.assertPermissionTable([["Sample Database", "Query builder only"]]);

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will only be able to use the query builder for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    H.assertPermissionTable(finalTablePermissions);
  });

  it("should allow setting create queries to 'query builder only' in group view", () => {
    cy.visit("/admin/permissions");
    H.selectSidebarItem("collection");

    H.assertPermissionTable([["Sample Database", "No"]]);

    // Drill down to tables permissions
    cy.findByTextEnsureVisible("Sample Database").click();

    H.assertPermissionTable([
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
    H.selectSidebarItem("collection");

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder only",
    );

    H.assertPermissionTable([["Sample Database", "Query builder only"]]);

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

    H.assertPermissionTable(finalTablePermissions);

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "collection will only be able to use the query builder for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    H.assertPermissionTable(finalTablePermissions);

    // After saving permissions, user should be able to make further edits without refreshing the page
    // metabase#37811
    H.selectSidebarItem("data");

    H.modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "No",
    );

    cy.button("Refresh the page").should("not.exist");

    // User should have the option to change permissions back to query builder only at the database level
    H.modifyPermission(
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

    H.selectSidebarItem("Sample Database");

    H.assertPermissionTable([
      ["Administrators", "Query builder and native"],
      ["All Users", "No"],
      ["collection", "No"],
      ["data", "Query builder and native"],
      ["nosql", "Query builder only"],
      ["readonly", "No"],
    ]);

    H.modifyPermission(
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
    H.assertPermissionTable(finalPermissions);

    H.selectSidebarItem("Orders");

    H.assertPermissionTable(finalPermissions);

    // Navigate back
    cy.get("a").contains("Sample Database").click();

    cy.button("Save changes").click();

    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.contains(
        "readonly will only be able to use the query builder for Sample Database.",
      );
      cy.button("Yes").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save changes").should("not.exist");

    H.assertPermissionTable(finalPermissions);
  });
});
