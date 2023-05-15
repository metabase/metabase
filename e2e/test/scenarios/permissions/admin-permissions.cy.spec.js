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
  isPermissionDisabled,
  visitQuestion,
  visitDashboard,
  selectPermissionRow,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const { ALL_USERS_GROUP, ADMIN_GROUP } = USER_GROUPS;

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
      ["Accounts", "No self-service", "No"],
      ["Analytic Events", "No self-service", "No"],
      ["Feedback", "No self-service", "No"],
      ["Invoices", "No self-service", "No"],
      ["Orders", "No self-service", "No"],
      ["People", "No self-service", "No"],
      ["Products", "No self-service", "No"],
      ["Reviews", "No self-service", "No"],
    ]);
  });

  it("should display error on failed save", () => {
    // revoke some permissions
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
    cy.icon("eye").first().click();
    cy.findAllByRole("option").contains("Unrestricted").click();

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
        cy.findByText("Discard your unsaved changes?");
        cy.findByText(
          "If you leave this page now, your changes won't be saved.",
        );

        cy.button("Cancel").click();
      });

      cy.url().should("include", "/admin/permissions/collections/root");

      // Switching to data permissions page again
      cy.get("label").contains("Data").click();

      modal().within(() => {
        cy.button("Discard changes").click();
      });

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
        DATA_ACCESS_PERMISSION_INDEX,
        "Unrestricted",
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
        cy.findByText("Discard your unsaved changes?");
        cy.findByText(
          "If you leave this page now, your changes won't be saved.",
        );

        cy.button("Cancel").click();
      });

      cy.url().should("include", "/admin/permissions/data/database");

      // Switching to collection permissions page again
      cy.get("label").contains("Collection").click();

      modal().within(() => {
        cy.button("Discard changes").click();
      });

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

        assertPermissionTable([["Sample Database", "Unrestricted", "Yes"]]);

        // Drill down to tables permissions
        cy.findByTextEnsureVisible("Sample Database").click();

        assertPermissionTable([
          ["Accounts", "Unrestricted", "Yes"],
          ["Analytic Events", "Unrestricted", "Yes"],
          ["Feedback", "Unrestricted", "Yes"],
          ["Invoices", "Unrestricted", "Yes"],
          ["Orders", "Unrestricted", "Yes"],
          ["People", "Unrestricted", "Yes"],
          ["Products", "Unrestricted", "Yes"],
          ["Reviews", "Unrestricted", "Yes"],
        ]);
      });

      it("allows view and edit permissions", () => {
        cy.visit("/admin/permissions");

        selectSidebarItem("collection");

        assertPermissionTable([["Sample Database", "No self-service", "No"]]);

        // Drill down to tables permissions
        cy.findByTextEnsureVisible("Sample Database").click();

        assertPermissionTable([
          ["Accounts", "No self-service", "No"],
          ["Analytic Events", "No self-service", "No"],
          ["Feedback", "No self-service", "No"],
          ["Invoices", "No self-service", "No"],
          ["Orders", "No self-service", "No"],
          ["People", "No self-service", "No"],
          ["Products", "No self-service", "No"],
          ["Reviews", "No self-service", "No"],
        ]);

        modifyPermission(
          "Orders",
          DATA_ACCESS_PERMISSION_INDEX,
          "Unrestricted",
        );

        modal().within(() => {
          cy.findByText("Change access to this database to limited?");
          cy.button("Change").click();
        });

        assertPermissionTable([
          ["Accounts", "No self-service", "No"],
          ["Analytic Events", "No self-service", "No"],
          ["Feedback", "No self-service", "No"],
          ["Invoices", "No self-service", "No"],
          ["Orders", "Unrestricted", "No"],
          ["People", "No self-service", "No"],
          ["Products", "No self-service", "No"],
          ["Reviews", "No self-service", "No"],
        ]);

        // Navigate back
        selectSidebarItem("collection");

        assertPermissionTable([["Sample Database", "Granular", "No"]]);

        modifyPermission(
          "Sample Database",
          NATIVE_QUERIES_PERMISSION_INDEX,
          "Yes",
        );

        modal().within(() => {
          cy.findByText("Allow native query editing?");
          cy.button("Allow").click();
        });

        assertPermissionTable([["Sample Database", "Unrestricted", "Yes"]]);

        // Drill down to tables permissions
        cy.findByTextEnsureVisible("Sample Database").click();

        assertPermissionTable([
          ["Accounts", "Unrestricted", "Yes"],
          ["Analytic Events", "Unrestricted", "Yes"],
          ["Feedback", "Unrestricted", "Yes"],
          ["Invoices", "Unrestricted", "Yes"],
          ["Orders", "Unrestricted", "Yes"],
          ["People", "Unrestricted", "Yes"],
          ["Products", "Unrestricted", "Yes"],
          ["Reviews", "Unrestricted", "Yes"],
        ]);

        cy.button("Save changes").click();

        modal().within(() => {
          cy.findByText("Save permissions?");
          cy.contains(
            "collection will be given access to 8 tables in Sample Database.",
          );
          cy.contains(
            "collection will now be able to write native queries for Sample Database.",
          );
          cy.button("Yes").click();
        });

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Save changes").should("not.exist");

        assertPermissionTable([
          ["Accounts", "Unrestricted", "Yes"],
          ["Analytic Events", "Unrestricted", "Yes"],
          ["Feedback", "Unrestricted", "Yes"],
          ["Invoices", "Unrestricted", "Yes"],
          ["Orders", "Unrestricted", "Yes"],
          ["People", "Unrestricted", "Yes"],
          ["Products", "Unrestricted", "Yes"],
          ["Reviews", "Unrestricted", "Yes"],
        ]);
      });
    });

    context("database focused view", () => {
      it("allows view and edit permissions", () => {
        cy.visit("/admin/permissions/");

        cy.get("label").contains("Databases").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Select a database to see group permissions");

        selectSidebarItem("Sample Database");

        assertPermissionTable([
          ["Administrators", "Unrestricted", "Yes"],
          ["All Users", "No self-service", "No"],
          ["collection", "No self-service", "No"],
          ["data", "Unrestricted", "Yes"],
          ["nosql", "Unrestricted", "No"],
          ["readonly", "No self-service", "No"],
        ]);

        selectSidebarItem("Orders");

        assertPermissionTable([
          ["Administrators", "Unrestricted", "Yes"],
          ["All Users", "No self-service", "No"],
          ["collection", "No self-service", "No"],
          ["data", "Unrestricted", "Yes"],
          ["nosql", "Unrestricted", "No"],
          ["readonly", "No self-service", "No"],
        ]);

        modifyPermission(
          "readonly",
          DATA_ACCESS_PERMISSION_INDEX,
          "Unrestricted",
        );

        modal().within(() => {
          cy.findByText("Change access to this database to limited?");
          cy.button("Change").click();
        });

        assertPermissionTable([
          ["Administrators", "Unrestricted", "Yes"],
          ["All Users", "No self-service", "No"],
          ["collection", "No self-service", "No"],
          ["data", "Unrestricted", "Yes"],
          ["nosql", "Unrestricted", "No"],
          ["readonly", "Unrestricted", "No"],
        ]);

        // Navigate back
        cy.get("a").contains("Sample Database").click();

        assertPermissionTable([
          ["Administrators", "Unrestricted", "Yes"],
          ["All Users", "No self-service", "No"],
          ["collection", "No self-service", "No"],
          ["data", "Unrestricted", "Yes"],
          ["nosql", "Unrestricted", "No"],
          ["readonly", "Granular", "No"],
        ]);

        modifyPermission("readonly", NATIVE_QUERIES_PERMISSION_INDEX, "Yes");

        modal().within(() => {
          cy.findByText("Allow native query editing?");
          cy.button("Allow").click();
        });

        assertPermissionTable([
          ["Administrators", "Unrestricted", "Yes"],
          ["All Users", "No self-service", "No"],
          ["collection", "No self-service", "No"],
          ["data", "Unrestricted", "Yes"],
          ["nosql", "Unrestricted", "No"],
          ["readonly", "Unrestricted", "Yes"],
        ]);

        cy.button("Save changes").click();

        modal().within(() => {
          cy.findByText("Save permissions?");
          cy.contains(
            "readonly will be given access to 8 tables in Sample Database.",
          );
          cy.contains(
            "readonly will now be able to write native queries for Sample Database.",
          );
          cy.button("Yes").click();
        });

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Save changes").should("not.exist");

        assertPermissionTable([
          ["Administrators", "Unrestricted", "Yes"],
          ["All Users", "No self-service", "No"],
          ["collection", "No self-service", "No"],
          ["data", "Unrestricted", "Yes"],
          ["nosql", "Unrestricted", "No"],
          ["readonly", "Unrestricted", "Yes"],
        ]);
      });
    });
  });
});

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows editing sandboxed access in the database focused view", () => {
    cy.visit(
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
    );

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

    modal().within(() => {
      cy.findByText("Change access to this database to limited?");
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
      ["Administrators", "Unrestricted", "Yes", "1 million rows", "Yes"],
      ["All Users", "Sandboxed", "No", "1 million rows", "No"],
      ["collection", "No self-service", "No", "No", "No"],
      ["data", "Unrestricted", "Yes", "No", "No"],
      ["nosql", "Unrestricted", "No", "No", "No"],
      ["readonly", "No self-service", "No", "No", "No"],
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
      ["Administrators", "Unrestricted", "Yes", "1 million rows", "Yes"],
      ["All Users", "Sandboxed", "No", "1 million rows", "No"],
      ["collection", "No self-service", "No", "No", "No"],
      ["data", "Unrestricted", "Yes", "No", "No"],
      ["nosql", "Unrestricted", "No", "No", "No"],
      ["readonly", "No self-service", "No", "No", "No"],
    ]);
  });

  it("'block' data permission should not have editable 'native query editing' option (metabase#17738)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All Users")
      .closest("tr")
      .as("allUsersRow")
      .within(() => {
        isPermissionDisabled(
          DATA_ACCESS_PERMISSION_INDEX,
          "No self-service",
          false,
        ).click();
        isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", true);
      });

    popover().contains("Block").click();

    cy.get("@allUsersRow").within(() => {
      isPermissionDisabled(DATA_ACCESS_PERMISSION_INDEX, "Block", false);
      isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", true);
    });
  });

  it("Visualization and Settings query builder buttons are not visible for questions that use blocked data sources", () => {
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          data: { schemas: "block" },
        },
      },
    });

    cy.signIn("nodata");
    visitQuestion(1);

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
          data: { schemas: "block" },
        },
      },
    });

    cy.signIn("nodata");
    visitDashboard(1);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don't have permission to see this card.");
  });
});
