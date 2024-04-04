import {
  restore,
  modal,
  assertPermissionTable,
  modifyPermission,
  selectSidebarItem,
} from "e2e/support/helpers";

const NATIVE_QUERIES_PERMISSION_INDEX = 1;

// - [ ] CREATE QUERIES
//   - [ ] split the existing tests in this file up across files in a create-queries folder
//   - [ ] QUERY BUILDER AND NATIVE
//     - [ ] should never be an option for schemas / tables if permissions are granular
//     - [ ] can change permissions to query builder and native again
//   - [ ] QUERY BUILDER ONLY
//     - [ ] should be able to set to query builder only
//   - [ ] NO
//     - [ ] should be able to set to no
//   - [ ] GRANULAR
//     - [ ] should be able to configure schemas independently
//     - [ ] should be able to configure tables independently
//     - [ ] should not be able to set granular permissions to query builder and native
//     - [ ] removing native permissions for a schema/table should remove native permissions for all other schemas/tables
//     - [ ] changing all granular permissions to same value should result in the value getting infered at the top level (parent should be value not granular)

describe(
  "scenarios > admin > permissions > view data",
  { tags: "@OSS" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    context("database focused view", () => {
      it("allows view and edit permissions", () => {
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
          "Query builder and native",
        );

        assertPermissionTable([
          ["Administrators", "Can view", "Query builder and native"],
          ["All Users", "Can view", "No"],
          ["collection", "Can view", "No"],
          ["data", "Can view", "Query builder and native"],
          ["nosql", "Can view", "Query builder only"],
          ["readonly", "Can view", "Query builder and native"],
        ]);

        selectSidebarItem("Orders");

        assertPermissionTable([
          ["Administrators", "Can view", "Query builder and native"],
          ["All Users", "Can view", "No"],
          ["collection", "Can view", "No"],
          ["data", "Can view", "Query builder and native"],
          ["nosql", "Can view", "Query builder only"],
          ["readonly", "Can view", "Query builder and native"],
        ]);

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

        assertPermissionTable([
          ["Administrators", "Can view", "Query builder and native"],
          ["All Users", "Can view", "No"],
          ["collection", "Can view", "No"],
          ["data", "Can view", "Query builder and native"],
          ["nosql", "Can view", "Query builder only"],
          ["readonly", "Can view", "Query builder and native"],
        ]);
      });
    });

    context("group focused view", () => {
      it("allows view and edit permissions", () => {
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
          "Query builder and native",
        );

        assertPermissionTable([
          ["Sample Database", "Can view", "Query builder and native"],
        ]);

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

        // After saving permissions, user should be able to make further edits without refreshing the page
        // metabase#37811
        selectSidebarItem("data");

        modifyPermission(
          "Sample Database",
          NATIVE_QUERIES_PERMISSION_INDEX,
          "No",
        );

        cy.button("Refresh the page").should("not.exist");
      });
    });
  },
);
