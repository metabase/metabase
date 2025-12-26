import dedent from "ts-dedent";

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  CardType,
  PythonTransformTableAliases,
  TransformTagId,
} from "metabase-types/api";
import { copyLayoutParams } from "echarts/types/src/util/layout";

const { H } = cy;
const { DataStudio, Workspaces } = H;
const { Transforms } = DataStudio;

const { ORDERS_ID } = SAMPLE_DATABASE;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_TABLE_2 = "transform_table_2";
const TARGET_SCHEMA = "Schema A";
const TARGET_SCHEMA_2 = "Schema B";
const CUSTOM_SCHEMA = "custom_schema";

describe("scenarios > data studio > workspaces", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("POST", "/api/ee/workspace").as("createWorkspace");
    cy.intercept("POST", "/api/ee/workspace/*/transform/*/run").as(
      "runTransform",
    );
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

  it("should be able to create, navigate, archive, unarchive, rename, and delete workspaces", () => {
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
    // Workspaces.getNewWorkspaceButton().click();
    registerWorkspaceAliasName("workspaceNameB");
    cy.get("@workspaceNameB").then((workspaceNameB: string) => {
      Workspaces.getWorkspaceNameInput().should("have.value", workspaceNameB);

      cy.get("@workspaceNameA").then((workspaceNameA) => {
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
        H.popover().findByText("Archive").click();
        verifyAndCloseToast("Workspace archived successfully");

        cy.log("should show archived workspaces and their status");
        Workspaces.getWorkspaceItem(workspaceNameA).should(
          "contain.text",
          "Archived",
        );

        // TODO: Move to another test, because we can't unarchive uninitialized workspace
        // cy.log("can unarchive a workspace");
        // Workspaces.getWorkspaceItemActions(workspaceNameA).click();
        // H.popover().findByText("Restore").click();
        // verifyAndCloseToast("Workspace restored successfully");
        // Workspaces.getWorkspaceItem(workspaceNameA).should(
        //   "contain.text",
        //   "Ready",
        // );

        cy.log("can delete a workspace");
        Workspaces.getWorkspaceItemActions(workspaceNameA).click();
        H.popover().findByText("Delete").click();
        H.modal().findByText("Delete").click();
        verifyAndCloseToast("Workspace deleted successfully");
        Workspaces.getWorkspaceItem(workspaceNameA).should("not.exist");

        cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);
        Workspaces.getWorkspaceNameInput().should("have.value", workspaceNameB);

        Workspaces.getWorkspaceNameInput()
          .clear()
          .type("Renamed workspace")
          .blur();
        Workspaces.getWorkspaceItem("Renamed workspace").should("be.visible");
      });
    });
  });

  it("should be able to check out existing transform into a new workspace from the transform page", () => {
    cy.log("Prepare available transforms: MBQL, Python, SQL");
    const sourceTable = `${TARGET_SCHEMA}.${SOURCE_TABLE}`;
    const targetTable = `${TARGET_SCHEMA}.${TARGET_TABLE}`;
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
      H.tabsShouldBe("SQL transform", ["Setup", "Agent Chat", "SQL transform"]);
    });
    cy.log("UI Controls are hidden/disabled until changes are made");
    Workspaces.getMergeWorkspaceButton().should("be.disabled");
    Workspaces.getTransformTargetButton().should("not.exist");
    Workspaces.getRunTransformButton().should("not.exist");
    Workspaces.getSaveTransformButton().should("not.exist");

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

    cy.findByLabelText(targetTable).should("be.visible").click();
    cy.wait("@runTransform");

    Workspaces.getWorkspaceContent().within(() => {
      H.tabsShouldBe(targetTable, [
        "Setup",
        "Agent Chat",
        "SQL transform",
        sourceTable,
        targetTable,
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
    H.modal().findByRole("button", { name: /Merge/ }).click();

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
    getTableLink().should("contain.text", TARGET_TABLE).click();

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

function createWorkspace() {
  Workspaces.getNewWorkspaceButton().click();
}

function createTransforms({ visit }: { visit?: boolean } = {}) {
  createMbqlTransform({
    targetTable: TARGET_TABLE,
  });

  H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then((id) => {
    createPythonTransform({
      body: dedent`
          import pandas as pd

          def transform(foo):
            return pd.DataFrame([{"foo": 42 }])
        `,
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
    targetTable: TARGET_TABLE,
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
    targetTable: TARGET_TABLE,
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
    targetTable: TARGET_TABLE,
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
