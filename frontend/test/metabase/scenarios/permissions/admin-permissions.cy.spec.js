import {
  restore,
  popover,
  modal,
  describeEE,
  describeOSS,
  assertPermissionTable,
  modifyPermission,
  selectSidebarItem,
  assertSidebarItems,
  isPermissionDisabled,
} from "__support__/e2e/cypress";

const COLLECTION_ACCESS_PERMISSION_INDEX = 0;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describeOSS("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shows hidden tables", () => {
    cy.visit("/admin/datamodel/database/1");
    cy.icon("eye_crossed_out")
      .eq(0)
      .click();

    cy.visit("admin/permissions/data/group/1/database/1");

    assertPermissionTable([
      ["Orders", "No self-service", "No"],
      ["People", "No self-service", "No"],
      ["Products", "No self-service", "No"],
      ["Reviews", "No self-service", "No"],
    ]);
  });

  it("should display error on failed save", () => {
    // revoke some permissions
    cy.visit("/admin/permissions/data/group/1");
    cy.icon("eye")
      .first()
      .click();
    cy.findAllByRole("option")
      .contains("Unrestricted")
      .click();

    // stub out the PUT and save
    cy.server();
    cy.route({
      method: "PUT",
      url: /\/api\/permissions\/graph$/,
      status: 500,
      response: "Server error",
    });
    cy.contains("Save changes").click();
    cy.contains("button", "Yes").click();

    // see error modal
    cy.contains("Server error");
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
      cy.get("label")
        .contains("Data permissions")
        .click();

      modal().within(() => {
        cy.findByText("Discard your unsaved changes?");
        cy.findByText(
          "If you leave this page now, your changes won't be saved.",
        );

        cy.button("Cancel").click();
      });

      cy.url().should("include", "/admin/permissions/collections/root");

      // Switching to data permissions page again
      cy.get("label")
        .contains("Data permissions")
        .click();

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

      selectSidebarItem("First collection"); // Expand children
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

  context("data permissions", () => {
    it("warns about leaving with unsaved changes", () => {
      cy.visit("/admin/permissions");

      selectSidebarItem("All Users");

      modifyPermission(
        "Sample Database",
        DATA_ACCESS_PERMISSION_INDEX,
        "Unrestricted",
      );

      cy.findByText("You've made changes to permissions.");

      // Switching to databases focus should not show any warnings
      cy.get("label")
        .contains("Databases")
        .click();

      cy.url().should("include", "/admin/permissions/data/database");
      modal().should("not.exist");

      // Switching to collection permissions page
      cy.get("label")
        .contains("Collection permissions")
        .click();

      modal().within(() => {
        cy.findByText("Discard your unsaved changes?");
        cy.findByText(
          "If you leave this page now, your changes won't be saved.",
        );

        cy.button("Cancel").click();
      });

      cy.url().should("include", "/admin/permissions/data/database");

      // Switching to collection permissions page again
      cy.get("label")
        .contains("Collection permissions")
        .click();

      modal().within(() => {
        cy.button("Discard changes").click();
      });

      cy.url().should("include", "/admin/permissions/collections");
    });

    context("group focused view", () => {
      it("shows filterable list of groups", () => {
        cy.visit("/admin/permissions");

        // no groups selected initially and it shows an empty state
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

        cy.url().should("include", "/admin/permissions/data/group/2");

        cy.findByText("Permissions for the Administrators group");
        cy.findByText("1 person");

        assertPermissionTable([["Sample Database", "Unrestricted", "Yes"]]);

        // Drill down to tables permissions
        cy.findByTextEnsureVisible("Sample Database").click();

        assertPermissionTable([
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
          ["Orders", "Unrestricted", "Yes"],
          ["People", "Unrestricted", "Yes"],
          ["Products", "Unrestricted", "Yes"],
          ["Reviews", "Unrestricted", "Yes"],
        ]);

        cy.button("Save changes").click();

        modal().within(() => {
          cy.findByText("Save permissions?");
          cy.contains(
            "collection will be given access to 4 tables in Sample Database.",
          );
          cy.contains(
            "collection will now be able to write native queries for Sample Database.",
          );
          cy.button("Yes").click();
        });

        cy.findByText("Save changes").should("not.exist");

        assertPermissionTable([
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

        cy.get("label")
          .contains("Databases")
          .click();

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
        cy.get("a")
          .contains("Sample Database")
          .click();

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
            "readonly will be given access to 4 tables in Sample Database.",
          );
          cy.contains(
            "readonly will now be able to write native queries for Sample Database.",
          );
          cy.button("Yes").click();
        });

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

  // TODO: uncomment when starts returning an error
  it.skip("block permission block access to questions that use blocked sources", () => {
    cy.signInAsNormalUser();

    cy.visit("/question/1");
    cy.findAllByText("Orders");

    cy.signInAsAdmin();

    cy.visit("/admin/permissions/data/database/1");

    ["All Users", "collection", "data", "nosql", "readonly"].forEach(group =>
      modifyPermission(group, DATA_ACCESS_PERMISSION_INDEX, "Block"),
    );

    cy.findByText("Save changes").click();

    modal().within(() => {
      cy.button("Yes").click();
    });

    cy.signInAsNormalUser();

    cy.visit("/question/1");

    cy.findAllByText("Orders").should("not.exist");
  });
});

describeEE("scenarios > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows editing sandboxed access in the database focused view", () => {
    cy.visit("/admin/permissions/data/database/1/schema/PUBLIC/table/2");

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Sandboxed");

    modal().within(() => {
      cy.findByText("Change access to this database to limited?");
      cy.button("Change").click();
    });

    cy.url().should(
      "include",
      "/admin/permissions/data/database/1/schema/PUBLIC/table/2/segmented/group/1",
    );
    cy.findByText("Grant sandboxed access to this table");
    cy.button("Save").should("be.disabled");

    cy.findByText("Pick a column").click();
    cy.findByText("User ID").click();

    cy.findByText("Pick a user attribute").click();
    cy.findByText("attr_uid").click();
    cy.button("Save").click();

    assertPermissionTable([
      ["Administrators", "Unrestricted", "Yes", "No"],
      ["All Users", "Sandboxed", "No", "No"],
      ["collection", "No self-service", "No", "No"],
      ["data", "Unrestricted", "Yes", "No"],
      ["nosql", "Unrestricted", "No", "No"],
      ["readonly", "No self-service", "No", "No"],
    ]);

    modifyPermission(
      "All Users",
      DATA_ACCESS_PERMISSION_INDEX,
      "Edit sandboxed access",
    );

    cy.url().should(
      "include",
      "/admin/permissions/data/database/1/schema/PUBLIC/table/2/segmented/group/1",
    );
    cy.findByText("Grant sandboxed access to this table");

    cy.button("Save").click();
    cy.findByText("Grant sandboxed access to this table").should("not.exist");

    cy.button("Save changes").click();

    assertPermissionTable([
      ["Administrators", "Unrestricted", "Yes", "No"],
      ["All Users", "Sandboxed", "No", "No"],
      ["collection", "No self-service", "No", "No"],
      ["data", "Unrestricted", "Yes", "No"],
      ["nosql", "Unrestricted", "No", "No"],
      ["readonly", "No self-service", "No", "No"],
    ]);
  });

  it("'block' data permission should not have editable 'native query editing' option (metabase#17738)", () => {
    cy.visit("/admin/permissions/data/database/1");

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

    popover()
      .contains("Block")
      .click();

    cy.get("@allUsersRow").within(() => {
      isPermissionDisabled(DATA_ACCESS_PERMISSION_INDEX, "Block", false);
      isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", true);
    });
  });
});
