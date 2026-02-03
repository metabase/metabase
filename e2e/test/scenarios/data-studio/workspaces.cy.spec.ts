import dedent from "ts-dedent";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { NativeEditor } from "e2e/support/helpers";
import type {
  DatabaseId,
  PythonTransformTableAliases,
  TransformId,
  TransformTagId,
  WorkspaceRunResponse,
} from "metabase-types/api";

const { H } = cy;
const { DataStudio, Workspaces } = H;
const { Transforms } = DataStudio;

const SOURCE_TABLE = "Animals";
const TARGET_TABLE_MBQL = "transform_table_1";
const TARGET_TABLE_SQL = "transform_table_2";
const TARGET_TABLE_PYTHON = "transform_table_3";
const TARGET_SCHEMA = "Schema A";

const COLOR_TEXT = "rgba(7, 23, 34, 0.84)";
const COLOR_SUCCESS = "rgb(104, 151, 53)";
const COLOR_DANGER = "rgb(227, 89, 94)";

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

    enableWorkspacesInDb(WRITABLE_DB_ID);

    cy.intercept("POST", "/api/ee/workspace").as("createWorkspace");
    cy.intercept("POST", "/api/ee/workspace/*/transform/*/run").as(
      "runTransform",
    );
    cy.intercept("POST", "/api/ee/workspace/*/run").as("runTransforms");
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

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
        H.tabsShouldBe("Setup", ["Setup", "Graph"]);

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
          cy.log("Updates setup logs (GDGT-1583)");
          Workspaces.getWorkspaceContent()
            .findByText("Workspace is archived")
            .should("be.visible");

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
          verifyAndCloseToast("Workspace renamed successfully");
          Workspaces.getWorkspaceItem("Renamed workspace").should("be.visible");
        });
      });
    });

    it("shows unsaved changes warning", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      H.NativeEditor.type(" LIMIT 2");

      cy.log("try to navigate away with unsaved changes - cancel navigation");
      DataStudio.nav().findByText("Glossary").click();
      H.modal().findByText("Discard your changes?").should("be.visible");
      H.modal().button("Cancel").click();

      Workspaces.getSaveTransformButton().click();
      Workspaces.getSaveTransformButton().should("be.disabled");

      cy.log("try to navigate away without unsaved changes");
      DataStudio.nav().findByText("Glossary").click();
      H.modal().should("not.exist");
      cy.location("pathname").should("eq", "/data-studio/glossary");
      cy.go("back");

      Workspaces.getWorkspaceTransforms().findByText("SQL transform").click();
      H.NativeEditor.type(";");

      cy.log("try to navigate away with unsaved changes - discard changes");
      DataStudio.nav().findByText("Glossary").click();
      H.modal().findByText("Discard your changes?").should("be.visible");
      H.modal().button("Discard changes").click();
      H.modal().should("not.exist");
      cy.location("pathname").should("eq", "/data-studio/glossary");
    });

    it("preserves workspace tabs state", () => {
      const sourceTable = `${TARGET_SCHEMA}.${SOURCE_TABLE}`;
      createTransforms();
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
      Workspaces.getSaveTransformButton().click();

      cy.log("Create a second workspace");
      createWorkspace();
      registerWorkspaceAliasName("workspaceB");

      cy.log("Second workspace should start with default tabs");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Setup", ["Setup", "Graph"]);
      });

      cy.log("Navigate back to first workspace");
      cy.get<string>("@workspaceA").then((workspaceNameA) => {
        Workspaces.getWorkspacesSection()
          .findByText(workspaceNameA)
          .should("be.visible")
          .click();

        cy.log("First workspace should preserve its tabs state");
        Workspaces.getWorkspaceContent().within(() => {
          H.tabsShouldBe(sourceTable, ["Setup", "Graph", "SQL transform"]);
        });

        H.NativeEditor.value().should("contain", "LIMIT 2");
      });
    });

    it("archives and unarchives populated workspace (GDGT-1583)", () => {
      createTransforms();
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
        Workspaces.openSetupTab();
        Workspaces.getWorkspaceItemActions(workspaceName).click();
        H.popover().findByText("Archive").click();
        verifyAndCloseToast("Workspace archived successfully");
        cy.log("Updates setup logs (GDGT-1583)");
        Workspaces.getWorkspaceContent()
          .findByText(/Workspace is archived/)
          .should("be.visible");
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
        H.NativeEditor.get().should("have.attr", "aria-readonly", "true");

        cy.log("Unarchive the workspace");
        Workspaces.openSetupTab();
        Workspaces.getWorkspaceItemActions(workspaceName).click();
        H.popover().findByText("Restore").click();
        verifyAndCloseToast("Workspace restored successfully");
        cy.log("Updates setup logs (GDGT-1583)");
        Workspaces.getWorkspaceContent()
          .findByText("Workspace ready!")
          .should("be.visible");
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

    it("should be able to check out existing SQL transform into a new workspace from the transform page", () => {
      cy.log("Prepare available transforms: MBQL, Python, SQL");
      const sourceTable = `${TARGET_SCHEMA}.${SOURCE_TABLE}`;
      const targetTableSql = `${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`;
      createTransforms({ visit: true });

      cy.log("Create a workspace, open transform page in it");
      cy.findByRole("button", { name: /Edit/ }).click();
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
        H.tabsShouldBe("SQL transform", ["Setup", "Graph", "SQL transform"]);
      });
      cy.log("UI Controls are hidden/disabled until changes are made");
      Workspaces.getMergeWorkspaceButton().should("be.disabled");
      Workspaces.getTransformTargetButton().should("not.exist");
      Workspaces.getRunTransformButton().should("not.exist");
      Workspaces.getSaveTransformButton().should("be.enabled");

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
          "Graph",
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
          "Graph",
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
        cy.findByTestId("transform-list-item")
          .should("contain.text", "SQL transform")
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
      verifyAndCloseToast("merged successfully");

      Transforms.list()
        .findByRole("row", { name: /SQL transform/ })
        .click();
      H.NativeEditor.value().should(
        "eq",
        'SELECT * FROM "Schema A"."Animals" LIMIT 2',
      );
      Transforms.runTab().click();
      runTransformAndWaitForSuccessOnTransformsPage();
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
        H.tabsShouldBe("Setup", ["Setup", "Graph"]);
      });

      cy.log("Open transform tabs");
      Workspaces.getMainlandTransforms().findByText("Python transform").click();

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Graph",
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
        H.tabsShouldBe("SQL transform", ["Setup", "Graph", "SQL transform"]);
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

      cy.log("Open the transform table tab");
      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar()
        .findByText(`${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`)
        .should("be.visible")
        .click();

      cy.log("Verify both tabs are open");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe(TARGET_TABLE_SQL, [
          "Setup",
          "Graph",
          "SQL transform",
          "transform_table",
        ]);
      });

      Workspaces.openCodeTab();

      cy.log("Remove the transform from the workspace");
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .realHover();
      Workspaces.getWorkspaceTransforms()
        .findByLabelText("More actions")
        .click();
      H.popover().findByText("Remove").click();
      verifyAndCloseToast("Transform removed from the workspace");

      cy.log("Verify both transform tab and table tab have been closed");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Setup", ["Setup", "Graph"]);
      });
    });
  });

  describe("setup tab", () => {
    it("should allow to change database before transforms are added", () => {
      H.addPostgresDatabase("Test DB", undefined, undefined, "testDbId");
      cy.get<DatabaseId>("@testDbId").then((testDbId) => {
        enableWorkspacesInDb(testDbId);
      });

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
      verifyAndCloseToast("Successfully updated workspace database");
      Workspaces.getWorkspaceDatabaseSelect().should(
        "have.value",
        "Writable Postgres12",
      );
    });

    it("should lock database dropdown when workspace has been initialized, shows setup log", () => {
      // @flaky
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

    it("should disable workspace actions while workspace is in pending status", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Mock /log endpoint to return pending status");
      cy.log("Add transform to workspace");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      H.NativeEditor.type(" LIMIT 2");

      cy.intercept("GET", "/api/ee/workspace/*/log", {
        body: {
          workspace_id: 1,
          status: "pending",
          updated_at: null,
          last_completed_at: null,
          logs: [
            {
              id: 1,
              task: "workspace-setup",
              description: "Setting up workspace",
              status: "started",
              message: null,
            },
          ],
        },
      }).as("getWorkspaceLog");

      Workspaces.getSaveTransformButton().click();

      cy.log("Verify merge button is disabled");
      Workspaces.getMergeWorkspaceButton().should("be.disabled");

      cy.log("Verify transform actions menu is disabled");
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .parent()
        .findByLabelText("More actions")
        .should("not.exist");

      cy.log(
        "Switch to Data tab and verify clicking uninitialized output table does not run transform",
      );
      Workspaces.openDataTab();
      cy.intercept("POST", "/api/ee/workspace/*/transform/*/run").as(
        "runTransformRequest",
      );
      cy.findByTestId("workspace-sidebar")
        .findByLabelText(/transform_table_2/)
        .click();
      cy.get("@runTransformRequest.all").should("have.length", 0);
    });
  });

  describe("graph tab", () => {
    it(
      "should display multiple transforms and their connections",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        createTransforms();
        Workspaces.visitWorkspaces();
        createWorkspace();

        Workspaces.getMainlandTransforms().findByText("SQL transform").click();
        Workspaces.getSaveTransformButton().click();
        Workspaces.getWorkspaceTransforms()
          .findByText("SQL transform")
          .should("be.visible");

        Workspaces.getMainlandTransforms()
          .findByText("Python transform")
          .click();
        Workspaces.getSaveTransformButton().click();
        Workspaces.getWorkspaceTransforms()
          .findByText("Python transform")
          .should("be.visible");

        Workspaces.getRunAllTransformsButton().click();
        H.popover().findByText("Run all transforms").click();
        verifyAndCloseToast("Transforms ran successfully");

        Workspaces.openGraphTab();

        // Verify nodes
        H.DependencyGraph.graph().should("be.visible");
        H.DependencyGraph.graph()
          .findByLabelText("SQL transform")
          .should("be.visible");
        H.DependencyGraph.graph()
          .findByLabelText("Python transform")
          .should("be.visible");
        H.DependencyGraph.graph()
          .findByLabelText(TARGET_TABLE_SQL)
          .should("be.visible");
        H.DependencyGraph.graph()
          .findByLabelText(TARGET_TABLE_PYTHON)
          .should("be.visible");

        // Verify edges: input tables -> transforms -> output tables
        // To simplify test logic, we just check that all edges are present.
        // In total there should be 4 edges:
        // - Animals -> SQL transform
        // - Animals -> Python transform
        // - SQL transform -> target table
        // - Python transform -> target table
        H.DependencyGraph.graph()
          .findAllByLabelText(/Edge from.*workspace-transform.*to.*Animals/)
          .should("have.length", 2);
        H.DependencyGraph.graph()
          .findAllByLabelText(/Edge from.*target.*to.*workspace-transform/)
          .should("have.length", 2);
      },
    );

    it("should allow clicking on graph nodes to see details", () => {
      // @flaky
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      Workspaces.getSaveTransformButton().click();
      runTransformAndWaitForSuccess();

      Workspaces.openGraphTab();

      H.DependencyGraph.graph().findByLabelText(SOURCE_TABLE).click();
      H.DependencyGraph.graph()
        .findByLabelText(SOURCE_TABLE)
        .should("have.attr", "aria-selected", "true");

      cy.log("Verify info panel shows fields for input table");
      cy.findByTestId("graph-info-panel").within(() => {
        cy.findByText("2 fields").should("be.visible");
        cy.findByText("Name").should("be.visible");
        cy.findByText("Score").should("be.visible");
        cy.findByLabelText("Close").click();
      });

      H.DependencyGraph.graph().findByLabelText("SQL transform").click();
      H.DependencyGraph.graph()
        .findByLabelText("SQL transform")
        .should("have.attr", "aria-selected", "true");

      cy.log("Verify info panel shows transform link");
      cy.findByTestId("graph-info-panel").within(() => {
        cy.findByLabelText("View this workspace transform").should(
          "be.visible",
        );
      });

      cy.log("Click transform link and verify navigation to transform tab");
      cy.findByTestId("graph-info-panel")
        .findByLabelText("View this workspace transform")
        .click();
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", ["Setup", "Graph", "SQL transform"]);
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
      cy.log("Save button should be disabled after saving");
      Workspaces.getSaveTransformButton().should("be.disabled");

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
        H.NativeEditor.type(";");
      });

      cy.log("Check that transform has yellow dot status again");
      Workspaces.getWorkspaceTransforms().within(() => {
        Workspaces.getTransformStatusDot("SQL transform").should("be.visible");
      });

      cy.log("Save it again");
      cy.log(
        "Add delay to API response to verify button is disabled immediately on click",
      );
      cy.intercept(
        { method: "PUT", url: "/api/ee/workspace/*/transform/*" },
        (req) => {
          req.on("response", (res) => {
            res.setDelay(500);
          });
        },
      ).as("updateTransformSlow");

      Workspaces.getWorkspaceContent().within(() => {
        Workspaces.getSaveTransformButton().click();
        cy.log("Save button should show loading state immediately after click");
        Workspaces.getSaveTransformButton().should("have.attr", "data-loading");
      });
      cy.log("Wait for save to complete");
      cy.wait("@updateTransformSlow");
      cy.log(
        "Save button should be disabled after save completes (no changes)",
      );
      Workspaces.getSaveTransformButton().should("be.disabled");

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
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();

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
        H.tabsShouldBe("New transform", ["Setup", "Graph", "New transform"]);
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
        cy.findByText("Incremental transformation").should("not.exist");
        cy.findByLabelText(/Table name/).should("have.value", "new_transform");
        cy.findByDisplayValue("new_transform").clear().type("test_table");

        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema B/ })
          .click();

        cy.findByRole("button", { name: /Save/ }).click();
      });
      verifyAndCloseToast("Transform saved successfully");

      cy.log("Verify transform is saved with new name");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", ["Setup", "Graph", "New transform"]);
      });

      cy.log(
        "Check transform appears in workspace transforms list with correct name",
      );
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");

      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar()
        .findByText("Schema B.test_table")
        .should("be.visible");

      Workspaces.getTransformTargetButton().click();
      H.modal().within(() => {
        cy.findByLabelText("Schema").should("have.value", "Schema B");
        cy.findByLabelText("New table name")
          .should("have.value", "test_table")
          .clear()
          .type("new_table");
        cy.findByRole("button", { name: /Change target/ }).click();
      });
      verifyAndCloseToast("Transform target updated");

      Workspaces.getWorkspaceSidebar()
        .findByText("Schema B.new_table")
        .should("be.visible");

      Workspaces.openCodeTab();
      Workspaces.getWorkspaceTransforms().within(() => {
        Workspaces.getTransformStatusDot("New transform").should("not.exist");
      });
    });

    it("should create new transform - Python", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Click Add Transform button");
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();

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
        H.tabsShouldBe("New transform", ["Setup", "Graph", "New transform"]);
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
        cy.findByText("Schema A").click();
        cy.findByText("Animals").click();
      });

      cy.log("Open transform settings");
      Workspaces.getSaveTransformButton().click();

      cy.log(
        "Check that table name gets automatically populated based on transform name",
      );
      H.modal().within(() => {
        cy.findByText("Incremental transformation").should("not.exist");
        cy.findByLabelText(/Table name/).should("have.value", "new_transform");
        cy.findByDisplayValue("new_transform").clear().type("test_table");

        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema B/ })
          .click();

        cy.findByRole("button", { name: /Save/ }).click();
      });
      verifyAndCloseToast("Transform saved successfully");

      cy.log("Verify transform is saved with new name");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", ["Setup", "Graph", "New transform"]);
      });

      cy.log(
        "Check transform appears in workspace transforms list with correct name",
      );
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");

      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar().within(() => {
        cy.findByText("Schema B.test_table").should("be.visible");
        cy.findByText("Schema A.Animals").should("be.visible");
      });

      cy.findByTestId("python-data-picker").findByText("Animals").click();

      H.entityPickerModal().within(() => {
        cy.findByText("Schema B").click();
        cy.findByText("Animals").click();
      });

      Workspaces.getSaveTransformButton().click();

      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar()
        .findByText("Schema B.Animals")
        .should("be.visible");

      Workspaces.getTransformTargetButton().click();
      H.modal().within(() => {
        cy.findByLabelText("Schema").should("have.value", "Schema B");
        cy.findByLabelText("New table name")
          .should("have.value", "test_table")
          .clear()
          .type("new_table");
        cy.findByRole("button", { name: /Change target/ }).click();
      });
      verifyAndCloseToast("Transform target updated");

      Workspaces.getWorkspaceSidebar()
        .findByText("Schema B.new_table")
        .should("be.visible");

      Workspaces.openCodeTab();
      Workspaces.getWorkspaceTransforms().within(() => {
        Workspaces.getTransformStatusDot("New transform").should("not.exist");
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
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();

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

  describe("data tab", () => {
    it("should list input and output tables", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();

      H.NativeEditor.type(" LIMIT 1;");
      Workspaces.getSaveTransformButton().click();

      cy.log("Close saved transform tab");
      Workspaces.getWorkspaceContent().within(() => {
        cy.findByRole("tab", { name: "SQL transform" })
          .findByLabelText("close icon")
          .click();
      });

      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar()
        .findByText(`${TARGET_SCHEMA}.${SOURCE_TABLE}`)
        .should("be.visible");
      Workspaces.getWorkspaceSidebar()
        .findByText(`${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`)
        .as("outputTable")
        .should("be.visible")
        .realHover();
      cy.root()
        .findByText("Run transform to see the results")
        .should("be.visible");

      cy.get("@outputTable").realHover().click();

      Workspaces.getWorkspaceContent().within(() => {
        cy.findByText("Loading...").should("be.visible");
        H.assertTableData({
          columns: ["Name", "Score"],
          firstRows: [["Duck", "10"]],
        });
      });

      Workspaces.getWorkspaceTabs().within(() => {
        H.tabsShouldBe(`${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`, [
          "Setup",
          "Graph",
          `${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`,
        ]);
      });

      Workspaces.getWorkspaceSidebar()
        .findByLabelText(`${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`)
        .findByLabelText("Open transform")
        .as("transformLink")
        .realHover();
      cy.root().findByText("Open transform").should("be.visible");
      cy.get("@transformLink").click();

      Workspaces.getWorkspaceTabs().within(() => {
        H.tabsShouldBe("SQL transform", [
          "Setup",
          "Graph",
          `${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`,
          "SQL transform",
        ]);
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

      Workspaces.getWorkspaceContent().findByText(
        "This transform hasn't been run before.",
      );

      Workspaces.getRunTransformButton().click();

      H.undoToast().findByText(/Transform run failed/);

      H.NativeEditor.type(" 1;");
      Workspaces.getSaveTransformButton().click();
      Workspaces.getRunTransformButton().click();

      Workspaces.getWorkspaceContent().findByText("Ran successfully");
      Workspaces.getWorkspaceContent().findByText(
        "Last ran a few seconds ago successfully.",
      );

      H.NativeEditor.type("{backspace}{backspace}");
      Workspaces.getSaveTransformButton().click();
      Workspaces.getRunTransformButton().click();

      H.undoToast().findByText(/Transform run failed/);
    });

    it("should show ad-hoc results", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Run ad-hoc query");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();

      H.NativeEditor.type(" LIMIT 1;");
      Workspaces.getSaveTransformButton().click();
      cy.log("open preview");
      cy.findByLabelText("Get Answer").click();

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Preview (SQL transform)", [
          "Setup",
          "Graph",
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

    it("should open preview on Cmd+Enter when no unsaved changes, and not when there are changes", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Open SQL transform and save");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      H.NativeEditor.type(" LIMIT 1;");
      Workspaces.getSaveTransformButton().click();

      cy.log("Cmd+Enter opens preview when transform is saved");
      H.NativeEditor.focus();
      cy.realPress([
        Cypress.platform === "darwin" ? "Meta" : "Control",
        "Enter",
      ]);
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Preview (SQL transform)", [
          "Setup",
          "Graph",
          "SQL transform",
          "Preview (SQL transform)",
        ]);
      });

      cy.log("Close preview tab");
      Workspaces.getWorkspaceContent().within(() => {
        cy.findByRole("tab", { name: "Preview (SQL transform)" })
          .icon("close")
          .click();
      });

      cy.log("Go back to SQL transform tab and make a change");
      Workspaces.getWorkspaceContent()
        .findByRole("tab", { name: "SQL transform" })
        .click();
      H.NativeEditor.type(" ");

      cy.log("Cmd+Enter does not open preview when there are unsaved changes");
      cy.realPress([
        Cypress.platform === "darwin" ? "Meta" : "Control",
        "Enter",
      ]);
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", ["Setup", "Graph", "SQL transform"]);
      });
    });

    it("should not show Python transform preview section in workspace", () => {
      H.setPythonRunnerSettings();
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Open Python transform in workspace");
      Workspaces.getMainlandTransforms().findByText("Python transform").click();

      cy.log("Inline preview section (Results/Output) should not be displayed");
      cy.findByTestId("python-results").should("not.exist");

      cy.log("Python editor should fill available height (no white box)");
      const MIN_EDITOR_HEIGHT = 590;
      cy.findByTestId("python-editor").should(($editor) => {
        const height = $editor.height();
        expect(height).to.be.at.least(
          MIN_EDITOR_HEIGHT,
          `Editor height should be at least ${MIN_EDITOR_HEIGHT}px, got ${height}`,
        );
      });
    });

    it(
      "should show ad-hoc results for Python transform",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        createTransforms();
        Workspaces.visitWorkspaces();
        createWorkspace();

        cy.log("Run ad-hoc Python query");
        Workspaces.getMainlandTransforms()
          .findByText("Python transform")
          .click();

        Workspaces.getSaveTransformButton().click();
        cy.findByLabelText("Get Answer").click();

        Workspaces.getWorkspaceTabs().within(() => {
          H.tabsShouldBe("Preview (Python transform)", [
            "Setup",
            "Graph",
            "Python transform",
            "Preview (Python transform)",
          ]);
          cy.findByText("Preview (Python transform)").click();
        });
        H.assertTableData({
          columns: ["foo"],
          firstRows: [["42"]],
        });
      },
    );

    it("should show ad-hoc error for SQL transform", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Run invalid ad-hoc SQL query");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();

      H.NativeEditor.type(" INVALID SYNTAX");
      Workspaces.getSaveTransformButton().click();
      cy.findByLabelText("Get Answer").click();

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Preview (SQL transform)", [
          "Setup",
          "Graph",
          "SQL transform",
          "Preview (SQL transform)",
        ]);
        cy.findByText("Preview (SQL transform)").click();
        cy.findByText(/Error loading data/i).should("be.visible");
      });
    });

    it(
      "should show ad-hoc error for Python transform",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        createTransforms();
        Workspaces.visitWorkspaces();
        createWorkspace();

        cy.log("Run invalid ad-hoc Python query");
        Workspaces.getMainlandTransforms()
          .findByText("Python transform")
          .click();

        H.PythonEditor.clear().paste("invalid python syntax !!!");
        Workspaces.getSaveTransformButton().click();
        cy.findByLabelText("Get Answer").click();

        Workspaces.getWorkspaceContent().within(() => {
          H.tabsShouldBe("Preview (Python transform)", [
            "Setup",
            "Graph",
            "Python transform",
            "Preview (Python transform)",
            "Results",
            "Output",
          ]);
          cy.findByText("Preview (Python transform)").click();
          cy.findByText(/Transform preview failed/i).should("be.visible");
        });
      },
    );
  });

  describe("run all transforms", () => {
    it("should run all transforms", { tags: ["@python"] }, () => {
      H.setPythonRunnerSettings();
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      Workspaces.getRunAllTransformsButton().should("be.disabled");

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      cy.log("Verify native editor is loaded");
      H.NativeEditor.get().should("contain.text", "SELECT");
      Workspaces.getSaveTransformButton().click();
      cy.log("Verify sql transform is saved to the workspace");
      Workspaces.getWorkspaceTransforms().should(
        "contain.text",
        "SQL transform",
      );

      Workspaces.getMainlandTransforms().findByText("Python transform").click();
      cy.log("Verify Python editor is loaded");
      H.PythonEditor.get().should("contain.text", "import");
      Workspaces.getSaveTransformButton().click();
      cy.log("Verify python transform is saved to the workspace");
      Workspaces.getWorkspaceTransforms().should(
        "contain.text",
        "Python transform",
      );

      Workspaces.getRunAllTransformsButton().should("be.enabled").click();

      H.popover().within(() => {
        cy.findByText("Run stale transforms").should("be.visible");
        cy.findByText("Run all transforms").should("be.visible").click();
      });

      Workspaces.getRunAllTransformsButton().should(
        "not.have.attr",
        "data-loading",
      );
      verifyAndCloseToast("Transforms ran successfully");

      Workspaces.getWorkspaceContent()
        .findByText("Last ran a few seconds ago successfully.")
        .should("be.visible");

      cy.findByRole("tab", { name: "SQL transform" }).click();

      Workspaces.getWorkspaceContent()
        .findByText("Last ran a few seconds ago successfully.")
        .should("be.visible");

      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar()
        .findByText(`${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`)
        .realHover();
      H.tooltip().should("not.exist");

      Workspaces.getWorkspaceSidebar()
        .findByText(`${TARGET_SCHEMA}.${TARGET_TABLE_PYTHON}`)
        .realHover();
      H.tooltip().should("not.exist");
    });

    it("should run all stale transforms", { tags: ["@python"] }, () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      Workspaces.openCodeTab();

      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      Workspaces.getSaveTransformButton().click();

      Workspaces.getMainlandTransforms().findByText("Python transform").click();
      Workspaces.getSaveTransformButton().click();

      Workspaces.getRunTransformButton().click();
      Workspaces.getWorkspaceContent()
        .findByText("Last ran a few seconds ago successfully.")
        .should("be.visible");

      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar()
        .findByText(`${TARGET_SCHEMA}.${TARGET_TABLE_PYTHON}`)
        .realHover();
      H.tooltip().should("not.exist");

      Workspaces.getRunAllTransformsButton().should("be.enabled").click();

      H.popover().within(() => {
        cy.findByText("Run all transforms").should("be.visible");
        cy.findByText("Run stale transforms").should("be.visible").click();
      });

      Workspaces.getRunAllTransformsButton().should(
        "have.attr",
        "data-loading",
        "true",
      );
      cy.wait<WorkspaceRunResponse, WorkspaceRunResponse>(
        "@runTransforms",
      ).then(({ response }) => {
        cy.log("only 1 stale transform has been executed");
        expect(response?.body.succeeded).to.be.an("array").with.length(1);
      });
      Workspaces.getRunAllTransformsButton().should(
        "not.have.attr",
        "data-loading",
      );
      verifyAndCloseToast("Transforms ran successfully");

      cy.findByRole("tab", { name: "SQL transform" }).click();

      Workspaces.getWorkspaceContent()
        .findByText("Last ran a few seconds ago successfully.")
        .should("be.visible");

      Workspaces.getWorkspaceSidebar()
        .findByText(`${TARGET_SCHEMA}.${TARGET_TABLE_SQL}`)
        .realHover();
      H.tooltip().should("not.exist");
    });
  });

  describe("transform -> workspace > ", () => {
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

      cy.findByRole("button", { name: /Edit/ }).click();

      cy.get<string>("@workspaceA").then((workspaceA) => {
        cy.get<string>("@workspaceB").then((workspaceB) => {
          H.popover().within(() => {
            cy.findAllByRole("menuitem").eq(0).contains("Edit definition");
            cy.findAllByRole("menuitem").eq(1).contains("New workspace");
            cy.findAllByRole("menuitem").eq(2).contains(workspaceB);
            cy.log("Check that edit redirects to correct workspace");
            cy.findAllByRole("menuitem").eq(3).contains(workspaceA).click();
          });
        });
      });

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", ["Setup", "Graph", "SQL transform"]);
      });
      Workspaces.getWorkspaceTransforms()
        .findByText("SQL transform")
        .should("not.exist");
    });

    it("should open checked out transform in existing workspace from the transform page", () => {
      // @flaky
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

      cy.findByRole("button", { name: /Edit/ }).click();
      cy.get<string>("@workspaceA").then((workspaceA) => {
        cy.get<string>("@workspaceB").then((workspaceB) => {
          H.popover().within(() => {
            cy.findAllByRole("menuitem").eq(1).contains("New workspace");
            cy.findAllByRole("menuitem").eq(3).contains(workspaceA);
            cy.log("Edit transform in a workspace where it's been checked out");
            cy.findAllByRole("menuitem").eq(2).contains(workspaceB).click();
          });
        });
      });

      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", ["Setup", "Graph", "SQL transform"]);
      });
      H.NativeEditor.value().should("contain", " LIMIT 2");
      Workspaces.getWorkspaceTransforms().findByText("SQL transform").click();
      cy.log(
        "Tabs state should stay the same, because this transform is already checked and its tab should be opened after redirect",
      );
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("SQL transform", ["Setup", "Graph", "SQL transform"]);
      });
    });

    it("should not allow to checkout transform if checkout_disabled is received", () => {
      cy.intercept("GET", "/api/ee/workspace/checkout*").as(
        "checkoutWorkspace",
      );

      H.createModelFromTableName({
        tableName: "Animals",
        modelName: "Animals",
        idAlias: "modelId",
      });

      cy.log("Create transform via UI with model reference");
      Workspaces.visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("SQL query").click();
      H.popover().findByText("Writable Postgres12").click();

      cy.get("@modelId").then((modelId) => {
        H.NativeEditor.type(`SELECT * FROM {{#${modelId}-animals}} as t;`);
      });

      H.DataStudio.Transforms.saveChangesButton().click();

      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("Model Reference Transform");
        cy.findByLabelText("Table name").clear().type("model_ref_transform");
        cy.button("Save").click();
      });

      // TODO: the tooltip assertions are flaky https://linear.app/metabase/issue/GDGT-1620
      // cy.log("Verify Edit transform button is disabled");
      // cy.findByRole("button", { name: /Edit/ }).click();
      // cy.wait("@checkoutWorkspace");
      // H.popover().contains("New workspace").should("be.disabled");
      // H.popover().contains("New workspace").realHover();
      // H.tooltip().should(
      //   "contain.text",
      //   "This transform cannot be edited in a workspace because it references other questions.",
      // );
      // cy.log("Close tooltip");
      // cy.get("body").click();

      cy.log("Edit transform to remove model reference");
      Transforms.clickEditDefinition();
      H.NativeEditor.type(
        '{selectall}SELECT * FROM "Schema A"."Animals" as t;',
      );
      Transforms.saveChangesButton().click();

      cy.log("Verify Edit transform button is now enabled");
      cy.findByRole("button", { name: /Edit/ }).should("be.enabled");
    });

    // unskip once GDGT-1564 is unblocked
    it.skip("should not allow workspace checkout when workspaces are disabled on DB (blocked by backend)", () => {
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        visitTransform: false,
      });

      cy.log("Disable workspaces on the database");
      cy.request("PUT", `/api/database/${WRITABLE_DB_ID}`, {
        settings: { "database-enable-workspaces": false },
      });

      cy.get<TransformId>("@transformId").then((transformId) => {
        H.visitTransform(transformId);
      });

      H.DataStudio.Transforms.editDefinitionButton().click();

      cy.log("Verify workspace checkout is disabled");
      // The backend should return checkout_disabled with a reason like "database-workspaces-disabled"
      // Frontend maps this to a user-friendly message via getCheckoutDisabledMessage()
      H.popover().contains("New workspace").should("be.disabled");
      H.popover().contains("New workspace").realHover();
      // TODO: update tooltip text once backend is done
      H.tooltip().should("contain.text", "cannot be edited in a workspace");
    });
  });

  describe("merge workspace", () => {
    it("shows target table diff and input tables diff", () => {
      H.getTableId({
        name: "Animals",
        databaseId: WRITABLE_DB_ID,
        schema: "Schema A",
      }).then((id1) => {
        H.getTableId({
          name: "Animals",
          databaseId: WRITABLE_DB_ID,
          schema: "Schema B",
        }).then((id2) => {
          createPythonTransform({
            body: TEST_PYTHON_TRANSFORM,
            sourceTables: { foo: id1, bar: id2 },
            visitTransform: true,
          });
        });
      });

      cy.findByRole("button", { name: /Edit/ }).click();
      H.popover().findByText("New workspace").click();

      cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);

      cy.log("rename 1st table's name");
      cy.findAllByLabelText("Reset alias to default")
        .should("have.length", 2)
        .eq(0)
        .click();

      cy.log("change 2nd table");
      cy.findByTestId("python-data-picker")
        .findAllByText("Animals")
        .should("have.length", 2)
        .eq(1)
        .click();
      H.entityPickerModal().within(() => {
        cy.findByText("Schema C").click();
        cy.findByText("Animals").click();
      });

      cy.log("add 3rd table");
      cy.button(/Add a table/).click();
      cy.findByTestId("python-data-picker")
        .findByText("Select a table…")
        .click();
      H.entityPickerModal().within(() => {
        cy.findByText("Schema D").click();
        cy.findByText("Animals").click();
      });

      Workspaces.getSaveTransformButton().click();

      cy.log("change target table");
      cy.button(/Change target/).click();
      H.modal().within(() => {
        cy.findByLabelText("Schema").clear().type("new_schema");
        cy.findByLabelText("New table name").clear().type("epic_table");
        cy.button("Change target").click();
      });
      verifyAndCloseToast("Transform target updated");

      cy.button("Merge").click();
      H.modal().within(() => {
        cy.findByText("Python transform").click();

        Workspaces.getTransformTargetDiff().within(() => {
          cy.findByText("Transform target").should("be.visible");
          verifyNormalText("Schema A");
          verifyRemovedText("transform_table_3");
          verifyAddedText("epic_table");
        });

        Workspaces.getSourceTablesDiff().within(() => {
          cy.findByText("Source tables").should("be.visible");

          cy.log("1st table");
          verifyRemovedText("foo");
          verifyAddedText("animals");
          verifyNormalText("Schema A");
          cy.findAllByText("Animals")
            .should("have.length", 3)
            .eq(0)
            .should("have.css", "text-decoration-line", "none")
            .and("have.css", "color", COLOR_TEXT);

          cy.log("2nd table");
          verifyNormalText("bar");
          verifyRemovedText("Schema B");
          verifyAddedText("Schema C");
          cy.findAllByText("Animals")
            .should("have.length", 3)
            .eq(1)
            .should("have.css", "text-decoration-line", "none")
            .and("have.css", "color", COLOR_TEXT);

          cy.log("3rd table");
          verifyAddedText("animals_1");
          verifyAddedText("Schema D");
          cy.findAllByText("Animals")
            .should("have.length", 3)
            .eq(2)
            .should("have.css", "text-decoration-line", "none")
            .and("have.css", "color", COLOR_SUCCESS);
        });
      });

      cy.realPress("Escape");

      cy.findAllByLabelText("Remove this table")
        .should("have.length", 3)
        .last()
        .click();
      cy.findAllByLabelText("Remove this table")
        .should("have.length", 2)
        .last()
        .click();
      Workspaces.getSaveTransformButton().click();

      cy.button("Merge").click();
      H.modal().within(() => {
        cy.findByText("Python transform").click();

        Workspaces.getSourceTablesDiff().within(() => {
          cy.findByText("Source tables").should("be.visible");

          cy.log("2nd table - removed");
          verifyRemovedText("bar");
          verifyRemovedText("Schema B");
          cy.findAllByText("Animals")
            .should("have.length", 2)
            .eq(1)
            .should("have.css", "text-decoration-line", "line-through")
            .and("have.css", "color", COLOR_DANGER);
        });
      });
    });

    it(
      "should be able to check out existing Python transform with multiple input tables into a new workspace",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        cy.log("Create Python transform with 2 input tables");
        H.getTableId({
          name: "Animals",
          databaseId: WRITABLE_DB_ID,
          schema: "Schema A",
        }).then((id1) => {
          H.getTableId({
            name: "Animals",
            databaseId: WRITABLE_DB_ID,
            schema: "Schema B",
          }).then((id2) => {
            createPythonTransform({
              body: TEST_PYTHON_TRANSFORM_MULTI_TABLE,
              sourceTables: { animals_a: id1, animals_b: id2 },
              visitTransform: true,
            });
          });
        });

        cy.log("Create a workspace and check out the transform");
        cy.findByRole("button", { name: /Edit/ }).click();
        H.popover().findByText("New workspace").click();

        cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);

        cy.log("Update the Python transform code");
        H.PythonEditor.clear().paste(TEST_PYTHON_TRANSFORM_MULTI_TABLE_UPDATED);
        Workspaces.getSaveTransformButton().click();

        cy.log("Run the transform");
        Workspaces.getRunTransformButton().click();
        Workspaces.getRunTransformButton().should(
          "have.text",
          "Ran successfully",
        );

        cy.log("Merge the workspace");
        Workspaces.getMergeWorkspaceButton().click();
        Workspaces.getMergeCommitInput().type("Merge Python transform");
        H.modal().within(() => {
          cy.findByText("1 transform will be merged").should("exist");
          cy.findByRole("button", { name: /Merge/ }).click();
        });
        verifyAndCloseToast("merged successfully");

        cy.log("Verify the merged transform runs correctly");
        Transforms.list()
          .findByRole("row", { name: /Python transform/ })
          .click();
        Transforms.runTab().click();
        runTransformAndWaitForSuccessOnTransformsPage();
        Transforms.settingsTab().click();
        getTableLink().should("contain.text", TARGET_TABLE_PYTHON).click();

        H.assertTableData({
          columns: ["Name", "Total Score"],
          firstRows: [
            ["Duck", "20"],
            ["Horse", "40"],
            ["Cow", "60"],
          ],
        });
      },
    );

    it(
      "should be able to create new SQL and Python transforms in a workspace and merge them to global list",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        cy.log("Create a new workspace");
        Workspaces.visitWorkspaces();
        createWorkspace();

        cy.log("Create a new SQL transform");
        Workspaces.getWorkspaceSidebar()
          .findByLabelText("Add transform")
          .click();
        H.popover()
          .findByRole("menuitem", { name: /SQL Transform/ })
          .click();

        H.NativeEditor.type(
          'SELECT * FROM "Schema A"."Animals" WHERE name = \'Duck\';',
        );
        Workspaces.getSaveTransformButton().click();
        H.modal().within(() => {
          cy.findByLabelText(/Table name/)
            .clear()
            .type("sql_table");
          cy.findByLabelText("Schema").click();
          cy.document()
            .findByRole("option", { name: /Schema A/ })
            .click();
          cy.findByRole("button", { name: /Save/ }).click();
        });
        verifyAndCloseToast("Transform saved successfully");

        cy.log("Create a new Python transform with 2 input tables");
        Workspaces.getWorkspaceSidebar()
          .findByLabelText("Add transform")
          .click();
        H.popover()
          .findByRole("menuitem", { name: /Python Script/ })
          .click();

        H.PythonEditor.clear().paste(TEST_PYTHON_TRANSFORM_MULTI_TABLE);
        Workspaces.getWorkspaceContent().within(() => {
          cy.findByTestId("python-data-picker")
            .findAllByText("Select a table…")
            .first()
            .click();
        });
        H.entityPickerModal().within(() => {
          cy.findByText("Schema A").click();
          cy.findByText("Animals").click();
        });
        Workspaces.getWorkspaceContent().within(() => {
          cy.button(/Add a table/).click();
          cy.findByTestId("python-data-picker")
            .findByText("Select a table…")
            .click();
        });
        H.entityPickerModal().within(() => {
          cy.findByText("Schema B").click();
          cy.findByText("Animals").click();
        });

        Workspaces.getSaveTransformButton().click();
        H.modal().within(() => {
          cy.findByLabelText(/Table name/)
            .clear()
            .type("python_table");
          cy.findByLabelText("Schema").click();
          cy.document()
            .findByRole("option", { name: /Schema A/ })
            .click();
          cy.findByRole("button", { name: /Save/ }).click();
        });
        verifyAndCloseToast("Transform saved successfully");

        cy.log("Merge the workspace");
        Workspaces.getMergeWorkspaceButton().click();
        Workspaces.getMergeCommitInput().type("Merge new transforms");
        H.modal().within(() => {
          cy.findByText("2 transforms will be merged").should("exist");
          cy.findByRole("button", { name: /Merge/ }).click();
        });
        verifyAndCloseToast("merged successfully");

        cy.log("Verify both transforms appear in global transforms list");
        Transforms.list()
          .findByRole("row", { name: /sql_table/ })
          .should("exist");
        Transforms.list()
          .findByRole("row", { name: /python_table/ })
          .should("exist");

        cy.log("Run SQL transform and verify results");
        Transforms.list()
          .findByRole("row", { name: /sql_table/ })
          .click();
        Transforms.runTab().click();
        runTransformAndWaitForSuccessOnTransformsPage();
        Transforms.settingsTab().click();
        getTableLink().should("contain.text", "sql_table").click();

        H.assertTableData({
          columns: ["Name", "Score"],
          firstRows: [["Duck", "10"]],
        });

        cy.log("Run Python transform and verify results");
        Workspaces.visitTransformListPage();
        Transforms.list()
          .findByRole("row", { name: /python_table/ })
          .click();
        Transforms.runTab().click();
        runTransformAndWaitForSuccessOnTransformsPage();
        Transforms.settingsTab().click();
        getTableLink().should("contain.text", "python_table").click();

        H.assertTableData({
          columns: ["Name", "Total Score"],
          firstRows: [["test", "0"]],
        });
      },
    );

    it("should preserve changed target table after merging workspace", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Check out existing SQL transform");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      Workspaces.getSaveTransformButton().click();

      cy.log("Change target table settings");
      Workspaces.getTransformTargetButton().click();
      H.modal().within(() => {
        cy.findByLabelText("Schema").should("have.value", "Schema A");
        cy.findByLabelText("New table name").clear().type("renamed_table");
        cy.findByRole("button", { name: /Change target/ }).click();
      });
      verifyAndCloseToast("Transform target updated");

      cy.log("Merge the workspace");
      Workspaces.getMergeWorkspaceButton().click();
      Workspaces.getMergeCommitInput().type("Rename target table");
      H.modal().within(() => {
        cy.findByText("1 transform will be merged").should("exist");

        cy.log("Verify target table diff is displayed");
        cy.findByText("SQL transform").click();
        Workspaces.getTransformTargetDiff().within(() => {
          verifyRemovedText("transform_table_2");
          verifyAddedText("renamed_table");
        });

        cy.findByRole("button", { name: /Merge/ }).click();
      });
      verifyAndCloseToast("merged successfully");

      cy.log("Verify target table is updated in global transform");
      Transforms.list()
        .findByRole("row", { name: /SQL transform/ })
        .click();
      Transforms.settingsTab().click();
      getTableLink({ isActive: false }).should("contain.text", "renamed_table");
    });

    it("should merge a chain of 3 dependent transforms created in workspace", () => {
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Create Transform 1: Base transform selecting from Animals");
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();
      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .click();

      H.NativeEditor.type('SELECT name, score FROM "Schema A"."Animals";');
      Workspaces.getSaveTransformButton().click();
      H.modal().within(() => {
        cy.findByLabelText(/Table name/)
          .clear()
          .type("chain_step_1");
        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema A/ })
          .click();
        cy.findByRole("button", { name: /Save/ }).click();
      });
      verifyAndCloseToast("Transform saved successfully");

      cy.log("Run Transform 1 to create the output table");
      Workspaces.getRunTransformButton().click();
      Workspaces.getRunTransformButton().should(
        "have.text",
        "Ran successfully",
      );

      cy.log("Create Transform 2: Depends on Transform 1");
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();
      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .click();

      H.NativeEditor.type(
        'SELECT name, score * 2 as score FROM "Schema A"."chain_step_1";',
      );
      Workspaces.getSaveTransformButton().click();
      H.modal().within(() => {
        cy.findByLabelText(/Table name/)
          .clear()
          .type("chain_step_2");
        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema A/ })
          .click();
        cy.findByRole("button", { name: /Save/ }).click();
      });
      verifyAndCloseToast("Transform saved successfully");

      cy.log("Run Transform 2");
      Workspaces.getRunTransformButton().click();
      Workspaces.getRunTransformButton().should(
        "have.text",
        "Ran successfully",
      );

      cy.log("Create Transform 3: Depends on Transform 2");
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();
      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .click();

      H.NativeEditor.type(
        'SELECT name, score * 2 as score FROM "Schema A"."chain_step_2";',
      );
      Workspaces.getSaveTransformButton().click();
      H.modal().within(() => {
        cy.findByLabelText(/Table name/)
          .clear()
          .type("chain_step_3");
        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema A/ })
          .click();
        cy.findByRole("button", { name: /Save/ }).click();
      });
      verifyAndCloseToast("Transform saved successfully");

      cy.log("Run Transform 3");
      Workspaces.getRunTransformButton().click();
      Workspaces.getRunTransformButton().should(
        "have.text",
        "Ran successfully",
      );

      cy.log("Merge the workspace with all 3 transforms");
      Workspaces.getMergeWorkspaceButton().click();
      Workspaces.getMergeCommitInput().type("Merge transform chain");
      H.modal().within(() => {
        cy.findByText("3 transforms will be merged").should("exist");
        cy.findByRole("button", { name: /Merge/ }).click();
      });
      verifyAndCloseToast("merged successfully");

      cy.log("Run chain_step_1 (first in chain)");
      Transforms.list()
        .findByRole("row", { name: /chain_step_1/ })
        .click();
      Transforms.runTab().click();
      runTransformAndWaitForSuccessOnTransformsPage();

      DataStudio.nav().findByRole("link", { name: "Transforms" }).click();

      cy.log("Run chain_step_2 (second in chain)");
      Transforms.list()
        .findByRole("row", { name: /chain_step_2/ })
        .click();
      Transforms.runTab().click();
      runTransformAndWaitForSuccessOnTransformsPage();

      DataStudio.nav().findByRole("link", { name: "Transforms" }).click();

      cy.log("Run chain_step_3 (final in chain) and verify results");
      Transforms.list()
        .findByRole("row", { name: /chain_step_3/ })
        .click();
      Transforms.runTab().click();
      runTransformAndWaitForSuccessOnTransformsPage();
      Transforms.settingsTab().click();
      getTableLink().should("contain.text", "chain_step_3").click();

      // Original scores: Duck=10, Horse=20, Cow=30
      // After 2 doublings (x2 x2 = x4): Duck=40, Horse=80, Cow=120
      H.assertTableData({
        columns: ["Name", "Score"],
        firstRows: [
          ["Duck", "40"],
          ["Horse", "80"],
          ["Cow", "120"],
        ],
      });
    });
  });

  describe("repros > ", () => {
    it("should not show error when editing a new transform in a workspace (GDGT-1445)", () => {
      Workspaces.visitTransformListPage();
      cy.findByLabelText("Create a transform").click();
      H.popover().findByText("SQL query").click();
      // to avoid flakiness on editor's focus
      cy.findByTestId("native-query-top-bar").should(
        "contain.text",
        "Writable Postgres12",
      );
      NativeEditor.type("select 1");
      cy.button("Save").click();
      cy.findByPlaceholderText("My Great Transform").type("My transform");
      H.modal().button("Save").click();

      cy.button(/Edit/).click();
      H.popover().findByText("New workspace").click();
      H.undoToast().should("not.exist");
      Workspaces.getWorkspaceTabs().within(() => {
        H.tabsShouldBe("My transform", ["Setup", "Graph", "My transform"]);
      });
    });

    it("should detect changes after closing and reopening a transform tab (GDGT-1535, GDGT-1551)", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Open transform and make edits");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      H.NativeEditor.type(" LIMIT 2");

      cy.log("Save the transform to workspace");
      Workspaces.getSaveTransformButton().click();
      Workspaces.getSaveTransformButton().should("be.disabled");

      cy.log("Make additional edits");
      H.NativeEditor.type(";");
      Workspaces.getSaveTransformButton().should("be.enabled");

      cy.log("Close the transform tab");
      Workspaces.getWorkspaceContent().within(() => {
        cy.findByRole("tab", { name: "SQL transform" })
          .findByLabelText("close icon")
          .click();
      });

      cy.log("Reopen the transform tab by clicking in Code tab");
      Workspaces.getWorkspaceTransforms().findByText("SQL transform").click();

      cy.log("Verify Save button is enabled (changes should be detected)");
      Workspaces.getSaveTransformButton().should("be.enabled");

      cy.log("Verify the edited content is preserved");
      H.NativeEditor.value().should("contain", "LIMIT 2;");

      cy.log("Create a new unsaved transform in the workspace");
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();
      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .click();

      cy.log("Verify the unsaved transform tab is opened");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Graph",
          "SQL transform",
          "New transform",
        ]);
      });

      cy.log("Close the unsaved transform tab");
      Workspaces.getWorkspaceContent().within(() => {
        cy.findByRole("tab", { name: "New transform" })
          .findByLabelText("close icon")
          .click();
      });

      cy.log("Reopen the unsaved transform tab by clicking in Code tab");
      Workspaces.getWorkspaceTransforms().findByText("New transform").click();

      cy.log("Verify the unsaved transform tab is reopened");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Graph",
          "SQL transform",
          "New transform",
        ]);
      });
    });

    it("should show empty state after creating, archiving, and deleting a workspace", () => {
      Workspaces.visitWorkspaces();

      // Create a new workspace
      createWorkspace();
      registerWorkspaceAliasName("workspaceToDelete");

      // Archive the workspace immediately
      cy.get<string>("@workspaceToDelete").then((workspaceName) => {
        Workspaces.getWorkspaceItemActions(workspaceName).click();
        H.popover().findByText("Archive").click();
        verifyAndCloseToast("Workspace archived successfully");

        // Verify it's archived
        Workspaces.getWorkspaceItem(workspaceName).should(
          "contain.text",
          "Archived",
        );

        // Delete the archived workspace
        Workspaces.getWorkspaceItemActions(workspaceName).click();
        H.popover().findByText("Delete").click();
        H.modal().findByText("Delete").click();
        verifyAndCloseToast("Workspace deleted successfully");

        // Verify workspace is gone
        Workspaces.getWorkspaceItem(workspaceName).should("not.exist");
      });

      // Verify empty state is shown again
      Workspaces.getWorkspacesPage()
        .findByText("No active workspaces")
        .should("be.visible");
      Workspaces.getWorkspacesSection()
        .findByText("No workspaces yet")
        .should("be.visible");
    });

    it("should show correct run status when switching tabs (GDGT-1571)", () => {
      createTransforms();
      Workspaces.visitWorkspaces();
      createWorkspace();

      cy.log("Create first SQL transform that will succeed");
      Workspaces.getMainlandTransforms().findByText("SQL transform").click();
      H.NativeEditor.type(" LIMIT 1;");
      Workspaces.getSaveTransformButton().click();

      cy.log("Run the successful transform");
      Workspaces.getRunTransformButton().click();
      Workspaces.getRunTransformButton().should(
        "have.text",
        "Ran successfully",
      );

      cy.log("Create second SQL transform that will fail");
      Workspaces.getWorkspaceSidebar().findByLabelText("Add transform").click();
      H.popover()
        .findByRole("menuitem", { name: /SQL Transform/ })
        .click();
      H.NativeEditor.type("INVALID SQL QUERY");
      H.NativeEditor.rejectCompletion();
      Workspaces.getSaveTransformButton().click();

      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("Failing transform");
        cy.findByText("Save").click();
      });

      cy.log("Run the failing transform");
      Workspaces.getRunTransformButton().click();
      Workspaces.getRunTransformButton().should("have.text", "Run failed");
      Workspaces.getRunStatus().should("contain.text", "Last run failed");

      cy.log("Switch to the first transform tab");
      Workspaces.getWorkspaceContent().within(() => {
        cy.findByRole("tab", { name: "SQL transform" }).click();
      });
      Workspaces.getRunStatus().should(
        "have.text",
        "Last ran a few seconds ago successfully.",
      );
    });
  });
});

function enableWorkspacesInDb(id: DatabaseId) {
  cy.request("POST", `/api/database/${id}/permission/workspace/check`, {
    cached: false,
  });
  cy.request("PUT", `/api/database/${id}`, {
    settings: { "database-enable-workspaces": true },
  });
}

function createWorkspace() {
  Workspaces.getNewWorkspaceButton().click();
}

const TEST_PYTHON_TRANSFORM = dedent`
  import pandas as pd

  def transform(foo):
      return pd.DataFrame([{"foo": 42 }])
`;

const TEST_PYTHON_TRANSFORM_MULTI_TABLE = dedent`
  import pandas as pd

  def transform(animals_a, animals_b):
      return pd.DataFrame([{"name": "test", "total_score": 0}])
`;

const TEST_PYTHON_TRANSFORM_MULTI_TABLE_UPDATED = dedent`
  import pandas as pd

  def transform(animals_a, animals_b):
      # Combine scores from both tables by name
      merged = animals_a.merge(animals_b, on="name", suffixes=("_a", "_b"))
      result = pd.DataFrame({
          "name": merged["name"],
          "total_score": merged["score_a"] + merged["score_b"]
      })
      return result
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
  Workspaces.getRunTransformButton().click();
  Workspaces.getRunTransformButton().should("have.text", "Ran successfully");
}

function runTransformAndWaitForSuccessOnTransformsPage() {
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

function verifyNormalText(text: string) {
  cy.findByText(text)
    .should("have.css", "text-decoration-line", "none")
    .and("have.css", "color", COLOR_TEXT);
}

function verifyAddedText(text: string) {
  cy.findByText(text)
    .should("have.css", "text-decoration-line", "none")
    .and("have.css", "color", COLOR_SUCCESS);
}

function verifyRemovedText(text: string) {
  cy.findByText(text)
    .should("have.css", "text-decoration-line", "line-through")
    .and("have.css", "color", COLOR_DANGER);
}
