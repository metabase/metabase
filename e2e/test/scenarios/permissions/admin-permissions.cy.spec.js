import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  modal,
  describeEE,
  onlyOnOSS,
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

const { ALL_USERS_GROUP, ADMIN_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const COLLECTION_ACCESS_PERMISSION_INDEX = 0;

const NATIVE_QUERIES_PERMISSION_INDEX = 0;

describe("scenarios > admin > permissions", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();

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

  context("data permissions", () => {
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
          ["Sample Database", "Query builder and native"],
        ]);

        // Drill down to tables permissions
        cy.findByTextEnsureVisible("Sample Database").click();

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

    // Data permissions w/o `legacy-no-self-service` in graph
    cy.get("main").within(() => {
      cy.findByText("Permissions help").as("permissionHelpButton").click();
      cy.get("@permissionHelpButton").should("not.exist");
    });

    cy.findByLabelText("Permissions help reference").within(() => {
      cy.findByText("Data permissions");

      cy.findByText("Database ‘View data’ levels").click();
      cy.findByTestId("database-view-data-level").should(
        "not.contain",
        /No self-service/,
      );
      cy.findByText("Database ‘View data’ levels").click();

      cy.findByText(/Schema or table ‘View data’ levels/).click();
      cy.findByTestId("schema-table-level").should(
        "not.contain",
        /No self-service/,
      );
      cy.findByText(/Schema or table ‘View data’ levels/).click();

      cy.findByText("‘Create queries’ levels");

      cy.findByLabelText("Close").click();
    });

    // Data permissions w/ `legacy-no-self-service` in graph
    cy.visit("/admin/permissions");

    cy.intercept("GET", `/api/permissions/graph/group/${ALL_USERS_GROUP}`, {
      statusCode: 200,
      body: {
        revision: 1,
        groups: {
          1: {
            1: {
              "view-data": "legacy-no-self-service",
              "create-queries": "query-builder-and-native",
              download: { schemas: "full" },
            },
          },
        },
      },
    });

    cy.get("main").within(() => {
      cy.findByText("Permissions help").as("permissionHelpButton").click();
      cy.get("@permissionHelpButton").should("not.exist");
    });

    cy.findByLabelText("Permissions help reference")
      .as("permissionsHelpContent")
      .within(() => {
        cy.findByText("Database ‘View data’ levels").click();
        cy.findAllByText(/No self-service/);
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
