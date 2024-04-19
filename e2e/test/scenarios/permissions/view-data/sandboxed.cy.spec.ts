import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  selectSidebarItem,
  modal,
  describeEE,
  assertPermissionTable,
  modifyPermission,
  setTokenFeatures,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const { ALL_USERS_GROUP } = USER_GROUPS;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describeEE("scenarios > admin > permissions > view data > sandboxed", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("allows editing sandboxed access in the database focused view", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    // make sure that we have native permissions now so that we can validate that
    // permissions are droped to query builder only after we sandbox a table
    modifyPermission(
      "All Users",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    selectSidebarItem("Orders");

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

    modal().within(() => {
      cy.findByText("Change access to this database to “Sandboxed”?");
      cy.button("Change").click();
    });

    cy.url().should(
      "include",
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}/segmented/group/${ALL_USERS_GROUP}`,
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Grant sandboxed access to this table");
    cy.button("Save").should("be.disabled");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User ID").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a user attribute").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("attr_uid").click();
    cy.button("Save").click();

    const expectedFinalPermissions = [
      [
        "Administrators",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "Yes",
      ],
      // expect that the view data permissions has been automatically droped to query builder only
      ["All Users", "Sandboxed", "Query builder only", "1 million rows", "No"],
      ["collection", "Can view", "No", "No", "No"],
      ["data", "Can view", "Query builder and native", "No", "No"],
      ["nosql", "Can view", "Query builder only", "No", "No"],
      ["readonly", "Can view", "No", "No", "No"],
    ];
    assertPermissionTable(expectedFinalPermissions);

    modifyPermission(
      "All Users",
      DATA_ACCESS_PERMISSION_INDEX,
      "Edit sandboxed access",
    );

    cy.url().should(
      "include",
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}/segmented/group/${ALL_USERS_GROUP}`,
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Grant sandboxed access to this table");

    cy.button("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Grant sandboxed access to this table").should("not.exist");

    cy.button("Save changes").click();

    assertPermissionTable(expectedFinalPermissions);
  });

  it("allows editing sandboxed access in the group focused view", () => {
    cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    // make sure that we have native permissions now so that we can validate that
    // permissions are droped to query builder only after we sandbox a table
    modifyPermission(
      "Sample Database",
      NATIVE_QUERIES_PERMISSION_INDEX,
      "Query builder and native",
    );

    cy.get("a").contains("Sample Database").click();

    modifyPermission("Orders", DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

    modal().within(() => {
      cy.findByText("Change access to this database to “Sandboxed”?");
      cy.button("Change").click();
    });

    cy.url().should(
      "include",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${ORDERS_ID}/segmented`,
    );
    modal().within(() => {
      cy.findByText("Grant sandboxed access to this table");
      cy.button("Save").should("be.disabled");
      cy.findByText("Pick a column").click();
    });

    popover().findByText("User ID").click();
    modal().findByText("Pick a user attribute").click();
    popover().findByText("attr_uid").click();
    modal().button("Save").click();

    const expectedFinalPermissions = [
      ["Accounts", "Can view", "Query builder only", "1 million rows", "No"],
      [
        "Analytic Events",
        "Can view",
        "Query builder only",
        "1 million rows",
        "No",
      ],
      ["Feedback", "Can view", "Query builder only", "1 million rows", "No"],
      ["Invoices", "Can view", "Query builder only", "1 million rows", "No"],
      ["Orders", "Sandboxed", "Query builder only", "1 million rows", "No"],
      ["People", "Can view", "Query builder only", "1 million rows", "No"],
      ["Products", "Can view", "Query builder only", "1 million rows", "No"],
      ["Reviews", "Can view", "Query builder only", "1 million rows", "No"],
    ];

    assertPermissionTable(expectedFinalPermissions);

    modifyPermission(
      "Orders",
      DATA_ACCESS_PERMISSION_INDEX,
      "Edit sandboxed access",
    );

    cy.url().should(
      "include",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC/${ORDERS_ID}/segmented`,
    );

    modal().findByText("Grant sandboxed access to this table");

    cy.button("Save").click();

    modal().should("not.exist");

    cy.url().should(
      "include",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC`,
    );

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?").should("exist");
      cy.contains(
        "All Users will be given access to 1 table in Sample Database",
      ).should("exist");
      cy.button("Yes").click();
    });

    cy.wait("@saveGraph");

    // assertions that specifically targets metabase#37774. Should be able to reload with the schema in the URL and not error
    cy.url().should(
      "include",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}/schema/PUBLIC`,
    );
    cy.reload();

    assertPermissionTable(expectedFinalPermissions);
  });
});
