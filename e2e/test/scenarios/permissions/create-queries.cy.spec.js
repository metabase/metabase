import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertPermissionForItem,
  assertPermissionTable,
  assertSameBeforeAndAfterSave,
  focusNativeEditor,
  modal,
  modifyPermission,
  popover,
  restore,
  runNativeQuery,
  selectPermissionRow,
  selectSidebarItem,
  setTokenFeatures,
  startNewNativeQuestion,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP, DATA_GROUP } = USER_GROUPS;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

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

  it("should allow setting 'query builder and native' in database view", () => {
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

  it("should allow setting 'query builder and native' in table view and it should be enforced correctly", () => {
    cy.log("should allow setting permissions value at table level");

    cy.visit(`/admin/permissions/data/group/${DATA_GROUP}`);

    const CREATE_QUERIES_PERM_IDX = 0;

    modifyPermission(
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );

    cy.get("main").findByText("Sample Database").click();

    modifyPermission(
      "Orders",
      CREATE_QUERIES_PERM_IDX,
      "Query builder and native",
    );

    assertSameBeforeAndAfterSave(() => {
      assertPermissionForItem(
        "Accounts",
        CREATE_QUERIES_PERM_IDX,
        "Query builder only",
      );
      assertPermissionForItem(
        "Orders",
        CREATE_QUERIES_PERM_IDX,
        "Query builder and native",
      );
    });

    cy.log("should enforce the new settings");
    cy.signOut();
    cy.signInAsNormalUser();

    cy.log("should work for table with native query access");
    startNewNativeQuestion();
    focusNativeEditor().type("SELECT * FROM Orders");
    runNativeQuery();
    cy.findAllByTestId("cell-data").should("contain", "1");

    cy.log("should not work for table without native query access");
    startNewNativeQuestion();
    focusNativeEditor()
      .type("{selectall}{backspace}", { delay: 50 })
      .type("SELECT * FROM Accounts");
    runNativeQuery();
    cy.findByTestId("query-visualization-root")
      .findByText(/You do not have permissions to run this query/)
      .should("exist");
    cy.findByTestId("qb-save-button").should("be.enabled").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").type("Save should fail");
      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.findByText("Save").click();
      cy.wait("@saveQuestion");
      cy.findByText(
        /You cannot save this Question because you do not have permissions to run its query/,
      ).should("exist");
    });
  });

  it("should only allow users to create native queries for tables they have permissions for", () => {
    cy.visit(`/admin/permissions/data/group/${DATA_GROUP}`);

    const CREATE_QUERIES_PERM_IDX = 0;

    modifyPermission(
      "Sample Database",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );

    cy.get("main").findByText("Sample Database").click();

    modifyPermission(
      "Orders",
      CREATE_QUERIES_PERM_IDX,
      "Query builder and native",
    );
  });

  it("should prompt users you can not have sandboxed permissions when granting native query access", () => {
    setTokenFeatures("all");

    cy.sandboxTable({
      table_id: ORDERS_ID,
      group_id: DATA_GROUP,
      attribute_remappings: {
        "User ID": ["dimension", ["field", ORDERS.USER_ID, null]],
      },
    });

    cy.visit(
      `/admin/permissions/data/group/${DATA_GROUP}/database/${SAMPLE_DB_ID}`,
    );

    const DATA_ACCESS_PERM_IDX = 0;
    const CREATE_QUERIES_PERM_IDX = 1;

    assertPermissionForItem("Orders", DATA_ACCESS_PERM_IDX, "Sandboxed");
    assertPermissionForItem(
      "Orders",
      CREATE_QUERIES_PERM_IDX,
      "Query builder only",
    );
    modifyPermission(
      "Orders",
      CREATE_QUERIES_PERM_IDX,
      "Query builder and native",
    );

    modal()
      .should("exist")
      .within(() => {
        cy.findByText(/Remove “Sandboxed” access from this table/).should(
          "exist",
        );
        cy.findByText("Change").click();
      });

    assertPermissionForItem("Orders", DATA_ACCESS_PERM_IDX, "Can view");
    assertPermissionForItem(
      "Orders",
      CREATE_QUERIES_PERM_IDX,
      "Query builder and native",
    );
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
