import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  modal,
  describeEE,
  isOSS,
  assertPermissionTable,
  assertPermissionOptions,
  modifyPermission,
  selectSidebarItem,
  assertSidebarItems,
  visitQuestion,
  visitDashboard,
  selectPermissionRow,
  setTokenFeatures,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const { ALL_USERS_GROUP, ADMIN_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const COLLECTION_ACCESS_PERMISSION_INDEX = 0;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describe("scenarios > admin > permissions", { tags: "@OSS" }, () => {
  beforeEach(() => {
    cy.onlyOn(isOSS);

    restore();
    cy.signInAsAdmin();
  });

  it("shows hidden tables", () => {
    cy.visit(`/admin/datamodel/database/${SAMPLE_DB_ID}`);
    cy.icon("eye_crossed_out").eq(0).click();

    cy.visit(
      `admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

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

  it("should display error on failed save", () => {
    // revoke some permissions
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    cy.icon("close").first().click();
    cy.findAllByRole("option").contains("Query builder and native").click();

    // stub out the PUT and save
    cy.intercept("PUT", "/api/permissions/graph", req => {
      req.reply(500, "Server error");
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save changes").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("button", "Yes").click();

    // see error modal
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Server error");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("There was an error saving");
  });

  context("collection permissions", () => {
    it("warns about leaving with unsaved changes", () => {
      cy.visit("/admin/permissions/collections");

      selectSidebarItem("First collection");

      modifyPermission(
        "All Users",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "View",
        true,
      );

      // Navigation to other collection should not show any warnings
      selectSidebarItem("Our analytics");

      modal().should("not.exist");

      // Switching to data permissions page
      cy.get("label").contains("Data").click();

      modal().within(() => {
        cy.findByText("Discard your changes?");
        cy.findByText(
          "Your changes haven't been saved, so you'll lose them if you navigate away.",
        );

        cy.button("Cancel").click();
      });

      cy.url().should("include", "/admin/permissions/collections/root");

      // Switching to data permissions page again
      cy.get("label").contains("Data").click();

      modal().button("Discard changes").click();

      cy.url().should("include", "/admin/permissions/data/group");
    });

    it("allows to view and edit permissions", () => {
      cy.visit("/admin/permissions/collections");

      const collections = ["Our analytics", "First collection"];
      assertSidebarItems(collections);

      selectSidebarItem("First collection");
      assertSidebarItems([...collections, "Second collection"]);

      selectSidebarItem("Second collection");

      assertPermissionTable([
        ["Administrators", "Curate"],
        ["All Users", "No access"],
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      modifyPermission(
        "All Users",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "View",
        true,
      );

      // Navigate to children
      selectSidebarItem("Third collection");

      assertPermissionTable([
        ["Administrators", "Curate"],
        ["All Users", "View"], // Check permission has been propagated
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      // Navigate to parent
      selectSidebarItem("First collection");

      assertPermissionTable([
        ["Administrators", "Curate"],
        ["All Users", "No access"],
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      modifyPermission(
        "All Users",
        COLLECTION_ACCESS_PERMISSION_INDEX,
        "Curate",
        false,
      );

      selectSidebarItem("Second collection");

      assertPermissionTable([
        ["Administrators", "Curate"],
        ["All Users", "View"], // Check permission has not been propagated
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);

      cy.button("Save changes").click();

      modal().within(() => {
        cy.findByText("Save permissions?");
        cy.findByText("Are you sure you want to do this?");
        cy.button("Yes").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save changes").should("not.exist");

      assertPermissionTable([
        ["Administrators", "Curate"],
        ["All Users", "View"],
        ["collection", "Curate"],
        ["data", "No access"],
        ["nosql", "No access"],
        ["readonly", "View"],
      ]);
    });
  });

  it("don't propagate permissions by checkbox without access select", () => {
    cy.visit("/admin/permissions/collections");

    const collections = ["Our analytics", "First collection"];
    assertSidebarItems(collections);

    selectSidebarItem("First collection");
    assertSidebarItems([...collections, "Second collection"]);

    selectSidebarItem("Second collection");

    assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);

    modifyPermission(
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "View",
      false,
    );

    modifyPermission(
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      null,
      true,
    );

    // Navigate to children
    selectSidebarItem("Third collection");

    assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "No access"], // Check permission hasn't been propagated
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);
  });

  it("show selected option for the collection with children", () => {
    cy.visit("/admin/permissions/collections");

    const collections = ["Our analytics", "First collection"];
    assertSidebarItems(collections);

    selectSidebarItem("First collection");
    assertSidebarItems([...collections, "Second collection"]);

    selectSidebarItem("Second collection");
    selectPermissionRow("All Users", COLLECTION_ACCESS_PERMISSION_INDEX);
    assertPermissionOptions(["Curate", "View", "No access"]);

    selectSidebarItem("Third collection");
    selectPermissionRow("All Users", COLLECTION_ACCESS_PERMISSION_INDEX);

    assertPermissionOptions(["Curate", "View"]);
  });

  context("view data permissions", () => {
    it("warns about leaving with unsaved changes", () => {
      cy.visit("/admin/permissions");

      selectSidebarItem("All Users");

      modifyPermission(
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You've made changes to permissions.");

      // Switching to databases focus should not show any warnings
      cy.get("label").contains("Databases").click();

      cy.url().should("include", "/admin/permissions/data/database");
      modal().should("not.exist");

      // Switching to collection permissions page
      cy.get("label").contains("Collection").click();

      modal().within(() => {
        cy.findByText("Discard your changes?");
        cy.findByText(
          "Your changes haven't been saved, so you'll lose them if you navigate away.",
        );

        cy.button("Cancel").click();
      });

      cy.url().should("include", "/admin/permissions/data/database");

      // Switching to collection permissions page again
      cy.get("label").contains("Collection").click();

      modal().button("Discard changes").click();

      cy.url().should("include", "/admin/permissions/collections");
    });

    context("group focused view", () => {
      it("shows filterable list of groups", () => {
        cy.visit("/admin/permissions");

        // no groups selected initially and it shows an empty state
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Select a group to see its data permissions");

        const groups = [
          "Administrators",
          "All Users",
          "collection",
          "data",
          "nosql",
          "readonly",
        ];

        assertSidebarItems(groups);

        // filter groups
        cy.findByPlaceholderText("Search for a group").type("a");

        const filteredGroups = [
          "Administrators",
          "All Users",
          "data",
          "readonly",
        ];

        // client filter debounce
        cy.wait(300);

        assertSidebarItems(filteredGroups);
      });

      it("allows to only view Administrators permissions", () => {
        cy.visit("/admin/permissions");

        selectSidebarItem("Administrators");

        cy.url().should(
          "include",
          `/admin/permissions/data/group/${ADMIN_GROUP}`,
        );

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Permissions for the Administrators group");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("1 person");

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
      });

      it("should show a modal when a revision changes while an admin is editing", () => {
        cy.intercept("/api/permissions/graph/group/1").as("graph");
        cy.visit("/admin/permissions");

        selectSidebarItem("collection");

        modifyPermission(
          "Sample Database",
          NATIVE_QUERIES_PERMISSION_INDEX,
          "Query builder and native",
        );

        cy.get("@graph").then(data => {
          cy.request("PUT", "/api/permissions/graph", {
            groups: {},
            revision: data.response.body.revision,
          }).then(() => {
            selectSidebarItem("data");

            modal().findByText("Someone just changed permissions");
          });
        });
      });
    });

    context("database focused view", () => {
      it("should show a modal when a revision changes while an admin is editing", () => {
        cy.intercept("/api/permissions/graph/group/1").as("graph");
        cy.visit("/admin/permissions/");

        selectSidebarItem("collection");

        modifyPermission(
          "Sample Database",
          NATIVE_QUERIES_PERMISSION_INDEX,
          "Query builder and native",
        );

        cy.get("@graph").then(data => {
          cy.request("PUT", "/api/permissions/graph", {
            groups: {},
            revision: data.response.body.revision,
          }).then(() => {
            cy.get("label").contains("Databases").click();
            selectSidebarItem("Sample Database");

            modal().findByText("Someone just changed permissions");
          });
        });
      });
    });
  });
});

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("allows editing sandboxed access in the database focused view", () => {
    cy.visit(
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
    );

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

    modal().within(() => {
      cy.findByText("Change access to this database to granular?");
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

    assertPermissionTable([
      [
        "Administrators",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "Yes",
      ],
      ["All Users", "Sandboxed", "No", "1 million rows", "No"],
      ["collection", "Can view", "No", "No", "No"],
      ["data", "Can view", "Query builder and native", "No", "No"],
      ["nosql", "Can view", "Query builder only", "No", "No"],
      ["readonly", "Can view", "No", "No", "No"],
    ]);

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

    assertPermissionTable([
      [
        "Administrators",
        "Can view",
        "Query builder and native",
        "1 million rows",
        "Yes",
      ],
      ["All Users", "Sandboxed", "No", "1 million rows", "No"],
      ["collection", "Can view", "No", "No", "No"],
      ["data", "Can view", "Query builder and native", "No", "No"],
      ["nosql", "Can view", "Query builder only", "No", "No"],
      ["readonly", "Can view", "No", "No", "No"],
    ]);
  });

  it("allows editing sandboxed access in the group focused view", () => {
    cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");
    cy.visit(
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

    modifyPermission("Orders", DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

    modal().within(() => {
      cy.findByText("Change access to this database to granular?");
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

    assertPermissionTable([
      ["Accounts", "Can view", "No", "1 million rows", "No"],
      ["Analytic Events", "Can view", "No", "1 million rows", "No"],
      ["Feedback", "Can view", "No", "1 million rows", "No"],
      ["Invoices", "Can view", "No", "1 million rows", "No"],
      ["Orders", "Sandboxed", "No", "1 million rows", "No"],
      ["People", "Can view", "No", "1 million rows", "No"],
      ["Products", "Can view", "No", "1 million rows", "No"],
      ["Reviews", "Can view", "No", "1 million rows", "No"],
    ]);

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

    assertPermissionTable([
      ["Accounts", "Can view", "No", "1 million rows", "No"],
      ["Analytic Events", "Can view", "No", "1 million rows", "No"],
      ["Feedback", "Can view", "No", "1 million rows", "No"],
      ["Invoices", "Can view", "No", "1 million rows", "No"],
      ["Orders", "Sandboxed", "No", "1 million rows", "No"],
      ["People", "Can view", "No", "1 million rows", "No"],
      ["Products", "Can view", "No", "1 million rows", "No"],
      ["Reviews", "Can view", "No", "1 million rows", "No"],
    ]);
  });

  it("Visualization and Settings query builder buttons are not visible for questions that use blocked data sources", () => {
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
    });

    cy.signIn("nodata");
    visitQuestion(ORDERS_QUESTION_ID);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question");
    cy.findByTestId("viz-settings-button").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("not.exist");
  });

  it("shows permission error for cards that use blocked data sources", () => {
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
        },
      },
    });

    cy.signIn("nodata");
    visitDashboard(ORDERS_DASHBOARD_ID);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don't have permission to see this card.");
  });
});

describe("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shows permissions help", () => {
    cy.visit("/admin/permissions");

    // Data permissions
    cy.get("main").within(() => {
      cy.findByText("Permission help").as("permissionHelpButton").click();
      cy.get("@permissionHelpButton").should("not.exist");
    });

    cy.findByLabelText("Permissions help reference")
      .as("permissionsHelpContent")
      .within(() => {
        cy.findByText("Data permissions");
        cy.findByText("Database levels");
        cy.findByText("Schema and table levels");
        cy.findByLabelText("Close").click();
      });

    cy.get("main").within(() => {
      cy.findByText("Collections").click();
      cy.get("@permissionHelpButton").click();
    });

    // Collection permissions
    cy.get("@permissionsHelpContent").within(() => {
      cy.findByText("Collection permissions");
      cy.findByText("Collections Permission Levels");
    });

    // The help reference keeps being open when switching tabs
    cy.get("main").within(() => {
      cy.findByText("Data").click();
    });

    cy.get("@permissionsHelpContent").within(() => {
      cy.findByText("Data permissions");
    });
  });
});
