import dedent from "ts-dedent";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { NativeEditor } from "e2e/support/helpers";
import type {
  PythonTransformTableAliases,
  TransformTagId,
} from "metabase-types/api";

const { H } = cy;
const { DataStudio, Workspaces } = H;
const { Transforms } = DataStudio;

const SOURCE_TABLE = "Animals";
const TARGET_TABLE_MBQL = "transform_table_1";
const TARGET_TABLE_SQL = "transform_table_2";
const TARGET_TABLE_PYTHON = "transform_table_3";
const TARGET_SCHEMA = "Schema A";

describe("scenarios > data studio > workspaces", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    // TODO: Is this correct way to grant querying permissions?
    cy.request("PUT", "/api/permissions/graph", {
      groups: {
        "1": {
          "1": { download: { schemas: "full" }, "view-data": "unrestricted" },
          "2": {
            "view-data": "unrestricted",
            download: { schemas: "full" },
            "create-queries": "query-builder-and-native",
          },
        },
      },
      revision: 1,
      sandboxes: [],
      impersonations: [],
    });

    cy.intercept("POST", "/api/ee/workspace").as("createWorkspace");
    cy.intercept("POST", "/api/ee/workspace/*/transform/*/run").as(
      "runTransform",
    );
    cy.intercept("POST", "/api/dataset").as("dataset");
    // cy.intercept("PUT", "/api/field/*").as("updateField");
    // cy.intercept("PUT", "/api/ee/transform/*").as("updateTransform");
    // cy.intercept("DELETE", "/api/ee/transform/*").as("deleteTransform");
    // cy.intercept("DELETE", "/api/ee/transform/*/table").as(
    //   "deleteTransformTable",
    // );
    // cy.intercept("POST", "/api/ee/transform-tag").as("createTag");
    // cy.intercept("PUT", "/api/ee/transform-tag/*").as("updateTag");
    // cy.intercept("DELETE", "/api/ee/transform-tag/*").as("deleteTag");
  });

  // afterEach(() => {
  //   H.expectNoBadSnowplowEvents();
  // });

  describe("should be able to create, navigate, archive, unarchive, rename, and delete workspaces", () => {
    it("creates, navigates, archives, renames and deletes workspaces", () => {
      Workspaces.visitWorkspaces();
      Workspaces.getWorkspacesPage()
        .findByText("No active workspaces")
        .should("be.visible");

      cy.log("Properly shows empty state.");
      Workspaces.getWorkspacesSection()
        .findByText("No workspaces yet")
        .should("be.visible");

      createWorkspace();
      registerWorkspaceAliasName("workspaceNameA");

      cy.log("Navigates to available workspace page.");
      Workspaces.visitWorkspaces();
      cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);

      cy.log("Shows workspace name");
      cy.get("@workspaceNameA").then((workspaceName) => {
        Workspaces.getWorkspaceNameInput().should("have.value", workspaceName);
      });
      Workspaces.getMergeWorkspaceButton().should("be.disabled");

      Workspaces.getWorkspaceContent().within(() => {
        cy.log("Starts on setup tab, and has only 2 tabs");
        H.tabsShouldBe("Setup", ["Setup", "Agent Chat"]);

        cy.log("shows workspace db");
        Workspaces.getWorkspaceDatabaseSelect()
          .should("have.value", "Writable Postgres12")
          .should("be.enabled");

        cy.log("Doesn't show workspace setup logs");
        cy.findByText("Setting up the workspace").should("not.exist");
      });

      Workspaces.getWorkspaceSidebar().within(() => {
        cy.log("starts on Code tab, and has only 2 tabs");
        H.tabsShouldBe("Code", ["Code", "Data"]);

        cy.log("shows transforms lists");
        cy.findByText("Workspace is empty").should("be.visible");
        cy.findByText("No available transforms").should("be.visible");
      });

      createWorkspace();
      registerWorkspaceAliasName("workspaceNameB");
      cy.get<string>("@workspaceNameB").then((workspaceNameB) => {
        Workspaces.getWorkspaceNameInput().should("have.value", workspaceNameB);

        cy.get<string>("@workspaceNameA").then((workspaceNameA) => {
          Workspaces.getWorkspacesSection().within(() => {
            cy.findByText(workspaceNameB).should("be.visible");
            cy.findByText(workspaceNameA).should("be.visible").click();
          });

          cy.log("can archive a workspace");
          Workspaces.getWorkspaceItemStatus(workspaceNameA).should(
            "contain.text",
            "Ready",
          );
          Workspaces.getWorkspaceItemActions(workspaceNameA).click();
          H.popover().findByText("Delete").should("not.exist");
          H.popover().findByText("Archive").click();
          verifyAndCloseToast("Workspace archived successfully");

          cy.log("shows archived workspaces and their status");
          Workspaces.getWorkspaceItem(workspaceNameA).should(
            "contain.text",
            "Archived",
          );

          cy.log("can delete a workspace");
          Workspaces.getWorkspaceItemActions(workspaceNameA).click();
          H.popover().findByText("Delete").click();
          H.modal().findByText("Delete").click();
          verifyAndCloseToast("Workspace deleted successfully");
          Workspaces.getWorkspaceItem(workspaceNameA).should("not.exist");

          cy.location("pathname").should(
            "match",
            /data-studio\/workspaces\/\d+/,
          );
          Workspaces.getWorkspaceNameInput().should(
            "have.value",
            workspaceNameB,
          );

          Workspaces.getWorkspaceNameInput()
            .clear()
            .type("Renamed workspace")
            .blur();
          Workspaces.getWorkspaceItem("Renamed workspace").should("be.visible");
        });
      });
    });

    it("preserves workspace tabs state", () => {
      const sourceTable = `${TARGET_SCHEMA}.${SOURCE_TABLE}`;
      createTransforms({ visit: false });

      Workspaces.visitWorkspaces();
      cy.log("Create workspace, open transform tab");
      createWorkspace();
      registerWorkspaceAliasName("workspaceA");

      cy.log("Open the transform tab");
      Workspaces.getWorkspaceSidebar()
        .findByText("SQL transform")
        .should("be.visible")
        .click();

      H.NativeEditor.type(" LIMIT 2");

      cy.log("Create a second workspace");
      createWorkspace();
      registerWorkspaceAliasName("workspaceB");

      cy.log("Second workspace should start with default tabs");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Setup", ["Setup", "Agent Chat"]);
      });

      cy.log("Navigate back to first workspace");
      cy.get<string>("@workspaceA").then((workspaceNameA) => {
        Workspaces.getWorkspacesSection()
          .findByText(workspaceNameA)
          .should("be.visible")
          .click();

        cy.log("First workspace should preserve its tabs state");
        Workspaces.getWorkspaceContent().within(() => {
          H.tabsShouldBe(sourceTable, ["Setup", "Agent Chat", "SQL transform"]);
        });

        H.NativeEditor.value().should("contain", "LIMIT 2");
      });
    });

    it("archives and unarchives populated workspace", () => {
      createTransforms({ visit: false });

      Workspaces.visitWorkspaces();
      createWorkspace();
      registerWorkspaceAliasName("workspaceA");

      cy.get<string>("@workspaceA").then((workspaceName) => {
        cy.log("Add a transform to the workspace");
        Workspaces.getWorkspaceSidebar()
          .findByText("SQL transform")
          .should("be.visible")
          .click();

        H.NativeEditor.type(" LIMIT 2");
        Workspaces.getSaveTransformButton().click();

        cy.log("Archive the workspace");
        Workspaces.getWorkspaceItemActions(workspaceName).click();
        H.popover().findByText("Archive").click();
        verifyAndCloseToast("Workspace archived successfully");

        Workspaces.getWorkspaceItem(workspaceName).should(
          "contain.text",
          "Archived",
        );

        cy.log("Block UI for archived workspace");
        Workspaces.getMergeWorkspaceButton().should("be.disabled");
        Workspaces.getWorkspaceDatabaseSelect().should("be.disabled");

        Workspaces.getWorkspaceTransforms().findByText("SQL transform").click();
        Workspaces.getRunTransformButton().should("be.disabled");
        Workspaces.getSaveTransformButton().should("be.disabled");
        Workspaces.getTransformTargetButton().should("be.disabled");
        Workspaces.getWorkspaceTransforms()
          .findByText("SQL transform")
          .realHover();
        Workspaces.getWorkspaceTransforms()
          .findByLabelText("More actions")
          .should("not.exist");
        //H.NativeEditor.should("be.disabled");

        cy.log("Unarchive the workspace");
        Workspaces.getWorkspaceItemActions(workspaceName).click();
        H.popover().findByText("Restore").click();
        verifyAndCloseToast("Workspace restored successfully");

        Workspaces.getWorkspaceItemStatus(workspaceName).should(
          "contain.text",
          "Ready",
        );
        Workspaces.getWorkspaceTransforms()
          .findByText("SQL transform")
          .realHover();
        Workspaces.getWorkspaceTransforms()
          .findByLabelText("More actions")
          .should("be.visible");
      });
    });

    it("should be able to check out existing transform into a new workspace from the transform page", () => {
      cy.log("Prepare available transforms: MBQL, Python, SQL");
      const sourceTable = `${TARGET_SCHEMA}.${SOURCE_TABLE}`;
      const targetTableSql = `${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`;
      createTransforms({ visit: true });

      cy.log("Create a workspace, open transform page in it");
      cy.findByRole("button", { name: /Edit transform/ }).click();
      H.popover().within(() => {
        cy.findByText("No workspaces yet").should("be.visible");
        cy.findByText("New workspace").should("be.visible").click();
      });
      registerWorkspaceAliasName("workspaceA");

      cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);
      cy.get("@workspaceA").then((workspaceName) => {
        Workspaces.getWorkspaceNameInput().should("have.value", workspaceName);
      });

      cy.log("No transforms are checked out yet");
      Workspaces.getWorkspacePage()
        .findByText("Workspace is empty")
        .should("be.visible");
      Workspaces.getMainlandTransforms()
        .findByText("Python transform")
        .should("be.visible");
      Workspaces.getMainlandTransforms()
        .findByText("MBQL transform")
        .should("be.visible")
        .realHover();
      H.tooltip()
        .findByText(/This transform cannot be edited/i)
        .should("be.visible");
      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("be.visible")
        .click();

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Agent Chat",
          "SQL transform",
        ]);
      });
      cy.log("UI Controls are hidden/disabled until changes are made");
      Workspaces.getMergeWorkspaceButton().should("be.disabled");
      Workspaces.getTransformTargetButton().should("not.exist");
      Workspaces.getRunTransformButton().should("not.exist");
      Workspaces.getSaveTransformButton().should("be.disabled");

      H.NativeEditor.type(" LIMIT 2");

      cy.log("UI Controls are enabled after changes");
      Workspaces.getMergeWorkspaceButton().should("be.disabled");
      Workspaces.getTransformTargetButton().should("not.exist");
      Workspaces.getRunTransformButton().should("not.exist");
      Workspaces.getSaveTransformButton().should("be.enabled").click();

      cy.log(
        "Merge/Run controls are enabled after transform is saved to a workspace",
      );
      Workspaces.getMergeWorkspaceButton().should("be.enabled");
      Workspaces.getSaveTransformButton().should("be.disabled");
      Workspaces.getRunTransformButton().should("be.enabled").click();

      Workspaces.getWorkspaceSidebar().within(() => {
        cy.findByRole("tab", { name: "Data" }).click();
        cy.findByLabelText(sourceTable).should("be.visible").click();
      });

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe(sourceTable, [
          "Setup",
          "Agent Chat",
          "SQL transform",
          sourceTable,
        ]);
        H.assertTableData({
          columns: ["Name", "Score"],
          firstRows: [
            ["Duck", "10"],
            ["Horse", "20"],
            ["Cow", "30"],
          ],
        });
      });

      cy.findByLabelText(targetTableSql).should("be.visible").click();
      cy.wait("@dataset");

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe(targetTableSql, [
          "Setup",
          "Agent Chat",
          "SQL transform",
          sourceTable,
          targetTableSql,
        ]);
        H.assertTableData({
          columns: ["Name", "Score"],
          firstRows: [
            ["Duck", "10"],
            ["Horse", "20"],
          ],
        });
        cy.findByText("Cow").should("not.exist");
        cy.findByText("30").should("not.exist");
      });

      Workspaces.getMergeWorkspaceButton().click();
      Workspaces.getMergeCommitInput().type("Merge transform");
      H.modal().within(() => {
        cy.log("All quality checks should be passed");
        cy.findByText("Quality Checks").should("exist");
        cy.findByText("External dependencies").should("exist");
        cy.findByText("Internal dependencies").should("exist");
        cy.findByText("Structural issues").should("exist");
        cy.findByText("Unused outputs").should("exist");
        cy.findByText("1 transform will be merged").should("exist");

        cy.log("Transform diffs are displayed");
        cy.findByText("Modified transforms").should("exist");
        cy.contains('[class*="sidebarItem"]', "SQL transform")
          .should("be.visible")
          .should(($el) => {
            expect($el.text()).to.include("SQL transform");
            expect($el.text()).to.match(/\+1\b/);
            expect($el.text()).to.match(/-1\b/);
          })
          .click();
        cy.contains(
          '[class*="cm-deletedLine"]',
          'SELECT * FROM "Schema A"."Animals"',
        );
        cy.contains(
          '[class*="cm-insertedLine"]',
          'SELECT * FROM "Schema A"."Animals" LIMIT 2',
        );

        cy.findByRole("button", { name: /Merge/ }).click();
      });

      Transforms.list()
        .findByRole("row", { name: /SQL transform/ })
        .click();
      H.NativeEditor.value().should(
        "eq",
        'SELECT * FROM "Schema A"."Animals" LIMIT 2',
      );
      Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      Transforms.settingsTab().click();
      getTableLink().should("contain.text", TARGET_TABLE_SQL).click();

      H.assertTableData({
        columns: ["Name", "Score"],
        firstRows: [
          ["Duck", "10"],
          ["Horse", "20"],
        ],
      });
      H.tableInteractiveBody().findByText("Cow").should("not.exist");
      H.tableInteractiveBody().findByText("30").should("not.exist");
    });
  });

  describe("should show tabs UI correctly", () => {
    it("should allow closing tabs with close button, selects fallback tab", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Setup", ["Setup", "Agent Chat"]);
      });

      cy.log("Open transform tabs");
      Workspaces.getMainlandTransforms().findByText("Python transform").click();

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Agent Chat",
          "Python transform",
          "SQL transform",
        ]);
      });

      cy.log("Reorder and close tabs");
      Workspaces.getWorkspaceContent().within(() => {
        cy.findAllByRole("tab").eq(3).as("sqlTransformTab");
        H.moveDnDKitElementByAlias("@sqlTransformTab", {
          horizontal: -150,
        });
        cy.wait(100);
        cy.findAllByRole("tab")
          .eq(0)
          .findByLabelText("close icon")
          .should("not.exist");
        cy.findAllByRole("tab")
          .eq(1)
          .findByLabelText("close icon")
          .should("not.exist");
        cy.findAllByRole("tab")
          .eq(2)
          .findByLabelText("close icon")
          .should("exist");
        cy.findAllByRole("tab")
          .eq(3)
          .findByLabelText("close icon")
          .should("exist")
          .click();
      });

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Agent Chat",
          "SQL transform",
        ]);
      });
    });

    it("closes relevant tabs after ws transform is removed", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      H.NativeEditor.type(" LIMIT 2");
      Workspaces.getSaveTransformButton().click();
      runTransformAndWaitForSuccess();

      // Open the transform table tab
      Workspaces.openDataTab().then(() => {
        cy.findByText(`${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`).should("be.visible").click();
      });

      // Verify both tabs are open
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe(TARGET_TABLE_SQL, [
          "Setup",
          "Agent Chat",
          "SQL transform",
          "transform_table",
        ]);
      });

      Workspaces.openCodeTab();

      // Remove the transform from the workspace
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .realHover();
      Workspaces.getWorkspaceTransforms()
        .findByLabelText("More actions")
        .click();
      H.popover().findByText("Remove").click();
      verifyAndCloseToast("Transform removed from the workspace");

      // Verify both transform tab and table tab have been closed
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Setup", ["Setup", "Agent Chat"]);
      });
    })
  });

  describe("setup tab", () => {
    it("should allow to change database before transforms are added", () => {
      H.addPostgresDatabase("Test DB");
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Database dropdown should be enabled initially");
      Workspaces.getWorkspaceDatabaseSelect()
        .should("have.value", "Test DB")
        .click();
      H.popover()
        .findByRole("option", { name: "Sample Database" })
        .should("not.exist");
      H.popover().findByRole("option", { name: "Writable Postgres12" }).click();

      cy.log("Verify database was changed");
      Workspaces.getWorkspaceDatabaseSelect().should(
        "have.value",
        "Writable Postgres12",
      );
    });

    it("should lock database dropdown when workspace has been initialized, shows setup log", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Add WS transform to lock DB selection");
      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("be.visible")
        .click();
      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.type(" LIMIT 2");
        Workspaces.getSaveTransformButton().click();

        cy.findByRole("tab", { name: "Setup" }).click();

        cy.log("Database dropdown should be disabled after adding transforms");
        Workspaces.getWorkspaceDatabaseSelect()
          .should("be.disabled")
          .should("have.value", "Writable Postgres12");

        cy.log("Setup log should be visible");
        cy.findByText(/Setting up the workspace/).should("be.visible");
      });
    });
  });

  describe("code tab", () => {
    it("should check out transform into the workspace and remove it", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Open mainland transform");
      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("be.visible")
        .click();

      cy.log("Make changes to the transform");
      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.type(" LIMIT 2");
      });

      cy.log(
        "Check that transform has yellow dot change indicator after editing",
      );
      Workspaces.getMainlandTransforms().within(() => {
        Workspaces.getTransformStatusDot("SQL transform").should("be.visible");
      });

      cy.log("Save the transform to add it to workspace");
      Workspaces.getSaveTransformButton().click();

      cy.log("Transform should be removed from available list after saving");
      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("not.exist");

      cy.log("Transform should appear in workspace transforms list");
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .should("be.visible");

      cy.log("Make additional changes to the saved transform");
      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.type(" ORDER BY 1");
      });

      cy.log("Check that transform has yellow dot status again");
      Workspaces.getWorkspaceTransforms().within(() => {
        Workspaces.getTransformStatusDot("SQL transform").should("be.visible");
      });

      cy.log("Save it again");
      Workspaces.getWorkspaceContent().within(() => {
        Workspaces.getSaveTransformButton().click();
      });

      cy.log("Check that yellow dot doesn't exist anymore after saving");
      Workspaces.getWorkspaceTransforms().within(() => {
        Workspaces.getTransformStatusDot("SQL transform").should("not.exist");
      });

      cy.log("Remove transform from the workspace through ellipsis menu");
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .realHover();
      Workspaces.getWorkspaceTransforms()
        .findByLabelText("More actions")
        .click();
      H.popover()
        .findByRole("menuitem", { name: /Remove/ })
        .click();

      cy.log("Check that it's not present in workspace transforms list");
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .should("not.exist");

      cy.log("Check that it's displayed back in available transforms list");
      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("be.visible");
    });
  });

  describe("transform tab", () => {
    it("should create new transform - SQL", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Click Add Transform button");
      Workspaces.getWorkspaceSidebar().within(() => {
        cy.findByLabelText("Add transform").click();
      });

      cy.log("Check that SQL and Python options are provided");
      H.popover()
        .findByRole("menuitem", { name: /Python Script/ })
        .should("be.visible");
      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .should("be.visible")
        .click();

      cy.log("Check that it opens new empty tab");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Agent Chat",
          "New transform",
        ]);
        H.NativeEditor.value().should("be.empty");
        Workspaces.getSaveTransformButton().should("be.disabled");
      });

      cy.log(
        "Check that 'New transform' is added to workspace transforms list",
      );
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");

      cy.log("Type a query in the editor");
      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.paste("SELECT * FROM many_schemas.animals");
      });

      cy.log("Open transform settings");
      Workspaces.getSaveTransformButton().click();

      cy.log(
        "Check that table name gets automatically populated based on transform name",
      );
      H.modal().within(() => {
        cy.findByLabelText(/Table name/).should("have.value", "new_transform");
        cy.findByDisplayValue("new_transform").clear().type("test_table");

        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema B/ })
          .click();

        cy.findByRole("button", { name: /Save/ }).click();
      });

      cy.log("Verify transform is saved with new name");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Agent Chat",
          "New transform",
        ]);
      });

      cy.log(
        "Check transform appears in workspace transforms list with correct name",
      );
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");

      Workspaces.openDataTab().then(() => {
        cy.findByText("Schema B.test_table").should("be.visible");
      });

      Workspaces.getTransformTargetButton().click();
      H.modal().within(() => {
        cy.findByLabelText("Schema").should("have.value", "Schema B");
        cy.findByLabelText("New table name")
          .should("have.value", "test_table")
          .clear()
          .type("new_table");
        cy.findByRole("button", { name: /Change target/ }).click();
      });

      Workspaces.getWorkspaceSidebar().within(() => {
        cy.findByText("Schema B.new_table").should("be.visible");
      });

      Workspaces.openCodeTab().then(() => {
        Workspaces.getWorkspaceTransforms().within(() => {
          Workspaces.getTransformStatusDot("New transform").should("not.exist");
        });
      });
    });

    it("should create new transform - Python", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Click Add Transform button");
      Workspaces.getWorkspaceSidebar().within(() => {
        cy.findByLabelText("Add transform").click();
      });

      cy.log("Check that Python and SQL options are provided");
      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .should("be.visible");
      H.popover()
        .findByRole("menuitem", { name: /Python Script/ })
        .should("be.visible")
        .click();

      cy.log("Check that it opens new empty tab");
      Workspaces.getWorkspaceTabs().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Agent Chat",
          "New transform",
        ]);
      });
      H.PythonEditor.value().should("not.be.empty");

      cy.log(
        "Check that 'New transform' is added to workspace transforms list",
      );
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");

      cy.log("Type a query in the editor");
      Workspaces.getWorkspaceContent().within(() => {
        H.PythonEditor.clear().paste(TEST_PYTHON_TRANSFORM);

        cy.findByTestId("python-data-picker")
          .findByText("Select a table…")
          .click();
      });

      H.entityPickerModal().within(() => {
        cy.findByText("Schema a").click();
        cy.findByText("Animals").click();
      });

      cy.log("Open transform settings");
      Workspaces.getSaveTransformButton().click();

      cy.log(
        "Check that table name gets automatically populated based on transform name",
      );
      H.modal().within(() => {
        cy.findByLabelText(/Table name/).should("have.value", "new_transform");
        cy.findByDisplayValue("new_transform").clear().type("test_table");

        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema B/ })
          .click();

        cy.findByRole("button", { name: /Save/ }).click();
      });

      cy.log("Verify transform is saved with new name");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Agent Chat",
          "New transform",
        ]);
      });

      cy.log(
        "Check transform appears in workspace transforms list with correct name",
      );
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");

      Workspaces.openDataTab().then(() => {
        cy.findByText("Schema B.test_table").should("be.visible");
        cy.findByText("Schema A.Animals").should("be.visible");
      });

      cy.findByTestId("python-data-picker").findByText("Animals").click();

      H.entityPickerModal().within(() => {
        cy.findByText("Schema B").click();
        cy.findByText("Animals").click();
      });

      Workspaces.getSaveTransformButton().click();

      Workspaces.openDataTab().then(() => {
        cy.findByText("Schema B.Animals").should("be.visible");
      });

      Workspaces.getTransformTargetButton().click();
      H.modal().within(() => {
        cy.findByLabelText("Schema").should("have.value", "Schema B");
        cy.findByLabelText("New table name")
          .should("have.value", "test_table")
          .clear()
          .type("new_table");
        cy.findByRole("button", { name: /Change target/ }).click();
      });

      Workspaces.getWorkspaceSidebar().within(() => {
        cy.findByText("Schema B.new_table").should("be.visible");
      });

      Workspaces.openCodeTab().then(() => {
        Workspaces.getWorkspaceTransforms().within(() => {
          Workspaces.getTransformStatusDot("New transform").should("not.exist");
        });
      });
    });

    it("should validate target name", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Add existing transform");
      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("be.visible")
        .click();

      cy.log("Make changes to the transform");
      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.type(" LIMIT 2");
      });
      Workspaces.getSaveTransformButton().click();

      cy.log("Create new transform");
      Workspaces.getWorkspaceSidebar().within(() => {
        cy.findByLabelText("Add transform").click();
      });

      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .click();

      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.paste("any text");
      });
      Workspaces.getSaveTransformButton().click();

      H.modal().within(() => {
        cy.findByDisplayValue("new_transform").clear();
        cy.findByText("Target table name is required").should("be.visible");
        cy.realType(TARGET_TABLE_SQL);
        cy.findByText(
          "Another transform in this workspace already targets that table",
        ).should("be.visible");
        cy.realType("1");
        cy.findByText(
          "Another transform in this workspace already targets that table",
        ).should("not.exist");
      });
    });
  });

  describe("run transform", () => {
    it("should run and fail transform runs", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Run transform");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();

      H.NativeEditor.type(" LIMIT");
      Workspaces.getSaveTransformButton().click();
      Workspaces.getRunTransformButton().click();

      H.undoToast().findByText("Failed to run transform");
      Workspaces.getWorkspaceContent().findByText(
        "This transform hasn't been run before.",
      );

      H.NativeEditor.type(" 1;");
      Workspaces.getSaveTransformButton().click();
      Workspaces.getRunTransformButton().click();

      // The run button state change happens very fast and behaves flaky. Not sure if we need to test it.
      // Workspaces.getWorkspaceContent().findByText("Ran successfully");
      Workspaces.getWorkspaceContent().findByText(
        "Last ran a few seconds ago successfully.",
      );

      H.NativeEditor.type("{backspace}{backspace}");
      Workspaces.getSaveTransformButton().click();
      Workspaces.getRunTransformButton().click();

      H.undoToast().findByText("Failed to run transform");
    });

    it("should show ad-hoc results", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Run ad-hoc query");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();

      H.NativeEditor.type(" LIMIT 1;");
      cy.findByTestId("run-button").click();

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Preview (SQL transform)", [
          "Setup",
          "Agent Chat",
          "SQL transform",
          "Preview (SQL transform)",
        ]);
        cy.findByText("Preview (SQL transform)").click();
        // TODO: Is it expected that ad-hoc cols have lowercase names?
        H.assertTableData({
          columns: ["name", "score"],
          firstRows: [["Duck", "10"]],
        });
      });
    });
  });

  describe("transform -> workspace", () => {
    it("should check out transform into a new workspace from the transform page", () => {
      cy.log("Create 2 workspaces, add transform to the second one");
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();
      registerWorkspaceAliasName("workspaceA");
      createWorkspace();
      registerWorkspaceAliasName("workspaceB");

      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("be.visible")
        .click();

      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.type(" LIMIT 2");
      });
      Workspaces.getSaveTransformButton().click();

      cy.log(
        "Check that all workspaces are available and sorted by checked status",
      );
      cy.visit("/data-studio/transforms");
      Transforms.list()
        .findByRole("row", { name: /SQL transform/ })
        .click();

      cy.findByRole("button", { name: /Edit transform/ }).click();
      H.popover().within(() => {
        cy.get<string>("@workspaceA").then((workspaceA) => {
          cy.get<string>("@workspaceB").then((workspaceB) => {
            cy.findAllByRole("menuitem").eq(0).contains("New workspace");
            cy.findAllByRole("menuitem").eq(1).contains(workspaceB);
            cy.log("Check that edit redirects to correct workspace");
            cy.findAllByRole("menuitem").eq(2).contains(workspaceA).click();
          });
        });
      });

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Agent Chat",
          "SQL transform",
        ]);
      });
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .should("not.exist");
    });

    it("should open checked out transform in existing workspace from the transform page", () => {
      cy.log("Create 2 workspaces, add transform to the second one");
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();
      registerWorkspaceAliasName("workspaceA");
      createWorkspace();
      registerWorkspaceAliasName("workspaceB");

      Workspaces.getMainlandTransforms()
        .findByText("SQL transform")
        .should("be.visible")
        .click();

      Workspaces.getWorkspaceContent().within(() => {
        H.NativeEditor.type(" LIMIT 2");
      });
      Workspaces.getSaveTransformButton().click();

      cy.visit("/data-studio/transforms");
      Transforms.list()
        .findByRole("row", { name: /SQL transform/ })
        .click();

      cy.findByRole("button", { name: /Edit transform/ }).click();
      H.popover().within(() => {
        cy.get<string>("@workspaceA").then((workspaceA) => {
          cy.get<string>("@workspaceB").then((workspaceB) => {
            cy.findAllByRole("menuitem").eq(0).contains("New workspace");
            cy.findAllByRole("menuitem").eq(2).contains(workspaceA);
            cy.log("Edit transform in a workspace where it's been checked out");
            cy.findAllByRole("menuitem").eq(1).contains(workspaceB).click();
          });
        });
      });

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Agent Chat",
          "SQL transform",
        ]);
      });
      H.NativeEditor.value().should("contain", " LIMIT 2");
      Workspaces.getWorkspaceTransforms().findByText("SQL transform").click();
      cy.log(
        "Tabs state should stay the same, because this transform is already checked and its tab should be opened after redirect",
      );
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Agent Chat",
          "SQL transform",
        ]);
      });
    });
  });

  describe("repros", () => {
    it("should not show error when editing a new transform in a workspace (GDGT-1445)", () => {
      Workspaces.visitTransformListPage();
      cy.findByLabelText("Create a transform").click();
      H.popover().findByText("SQL query").click();
      NativeEditor.type("select 1");
      cy.button("Save").click();
      cy.findByPlaceholderText("My Great Transform").type("My transform");
      H.modal().button("Save").click();

      cy.button(/Edit transform/).click();
      H.popover().findByText("New workspace").click();
      H.undoToast().should("not.exist");
      Workspaces.getWorkspaceTabs().within(() => {
        H.tabsShouldBe("My transform", ["Setup", "Agent Chat", "My transform"]);
      });
    });
  });
});

function createWorkspace() {
  Workspaces.getNewWorkspaceButton().click();
}

const TEST_PYTHON_TRANSFORM = dedent`
  import pandas as pd

  def transform(foo):
      return pd.DataFrame([{"foo": 42 }])
`;
function createTransforms({ visit }: { visit?: boolean } = { visit: false }) {
  createMbqlTransform({
    targetTable: TARGET_TABLE_MBQL,
  });

  H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then((id) => {
    createPythonTransform({
      body: TEST_PYTHON_TRANSFORM,
      sourceTables: { foo: id },
    });
  });

  createSqlTransform({
    sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
    visitTransform: visit,
  });
}

function createMbqlTransform(
  opts: {
    sourceTable?: string;
    targetTable?: string;
    targetSchema?: string | null;
    tagIds?: TransformTagId[];
    name?: string;
    databaseId?: number;
    visitTransform?: boolean;
  } = {},
) {
  return H.createMbqlTransform({
    sourceTable: SOURCE_TABLE,
    targetTable: TARGET_TABLE_MBQL,
    targetSchema: TARGET_SCHEMA,
    name: "MBQL transform",
    ...opts,
  });
}

function createSqlTransform(opts: {
  sourceQuery: string;
  targetTable?: string;
  targetSchema?: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
}) {
  return H.createSqlTransform({
    targetTable: TARGET_TABLE_SQL,
    targetSchema: TARGET_SCHEMA,
    ...opts,
  });
}

function createPythonTransform(opts: {
  body: string;
  sourceTables: PythonTransformTableAliases;
  targetTable?: string;
  targetSchema?: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
}) {
  return H.createPythonTransform({
    targetTable: TARGET_TABLE_PYTHON,
    targetSchema: TARGET_SCHEMA,
    ...opts,
  });
}

function getTableLink({ isActive = true }: { isActive?: boolean } = {}) {
  return cy
    .findByTestId("table-link")
    .should("have.attr", "aria-disabled", String(!isActive));
}

function runTransformAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
}

function getRunButton(options: { timeout?: number } = {}) {
  return cy.findAllByTestId("run-button").eq(0, options);
}

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click({ force: true });
}

function registerWorkspaceAliasName(name: string) {
  cy.wait("@createWorkspace").then((interception) => {
    const workspaceName = interception.response?.body?.name;
    // Backend returns randomized name.
    cy.wrap(workspaceName).as(name);
  });
}
