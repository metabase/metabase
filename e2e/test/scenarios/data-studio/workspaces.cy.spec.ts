import dedent from "ts-dedent";

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  CardType,
  PythonTransformTableAliases,
  TransformTagId,
} from "metabase-types/api";

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

    // cy.intercept("PUT", "/api/field/*").as("updateField");
    // cy.intercept("POST", "/api/ee/transform").as("createTransform");
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

  it("should be able to create, navigate, archive, and rename workspaces", () => {
    Workspaces.visitDataStudio();

    Workspaces.getWorkspacesSection()
      .findByText("No workspaces yet")
      .should("be.visible");

    createWorkspace("Workspace A");

    cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);

    cy.log("shows workspace name");
    Workspaces.getWorkspaceNameInput().should("have.value", "Workspace A");
    Workspaces.getMergeWorkspaceButton().should("be.disabled");

    Workspaces.getWorkspaceContent().within(() => {
      cy.log("starts on setup tab, and has only 2 tabs");
      H.tabsShouldBe("Setup", ["Setup", "Agent Chat"]);

      cy.log("shows workspace db");
      cy.findByText("Writable Postgres12").should("be.visible");

      cy.log("shows workspace setup logs");
      cy.findByText("Provisioning database isolation").should("be.visible");
      cy.findByText("Setting up the workspace").should("be.visible");
      cy.findByText("Workspace ready!").should("be.visible");
    });

    Workspaces.getWorkspaceSidebar().within(() => {
      cy.log("starts on Code tab, and has only 2 tabs");
      H.tabsShouldBe("Code", ["Code", "Data"]);

      cy.log("shows transforms list");
      cy.findByText("Workspace is empty").should("be.visible");
    });

    createWorkspace("Workspace B");
    Workspaces.getWorkspaceNameInput().should("have.value", "Workspace B");

    Workspaces.getWorkspacesSection().within(() => {
      cy.findByText("Workspace B").should("be.visible");
      cy.findByText("Workspace A").should("be.visible").click();
    });

    Workspaces.getWorkspaceNameInput().should("have.value", "Workspace A");

    cy.log("can archive a workspace");
    Workspaces.getWorkspaceItemActions(/Workspace A/).click();
    H.popover().findByText("Archive").click();
    H.undoToast().should("have.text", "Workspace archived successfully");
    Workspaces.getWorkspaceItem(/Workspace A/).should(
      "contain.text",
      "Archived",
    );
    cy.location("pathname").should("eq", "/data-studio/workspaces");

    Workspaces.getWorkspacesPage().within(() => {
      cy.findByText("Workspaces").should("be.visible");
      cy.findByText("Workspace A").should("not.exist");
      cy.log("can navigate from workspaces list to a workspace");
      cy.findByText("Workspace B").should("be.visible").click();
    });

    cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);
    Workspaces.getWorkspaceNameInput().should("have.value", "Workspace B");

    Workspaces.getWorkspaceNameInput().clear().type("Renamed workspace").blur();
    // H.undoToast().should("have.text", "Workspace renamed"); // TODO: uncomment when implemented
    Workspaces.getWorkspaceItem(/Renamed workspace/).should("be.visible");

    // TODO: workspace deletion?
  });

  it("should be able to check out exisitng transform into a new workspace from the transform page", () => {
    const sourceTable = `${TARGET_SCHEMA}.${SOURCE_TABLE}`;

    createTransforms({ visit: true });

    cy.findByRole("button", { name: /Edit transform/ }).click();
    H.popover().within(() => {
      cy.findByText("No workspaces yet").should("be.visible");
      cy.findByText("New workspace").should("be.visible").click();
    });

    Workspaces.getNewWorkspaceNameInput().should("have.value", "New workspace");
    Workspaces.getNewWorkspaceDatabaseInput().should(
      "have.value",
      "Writable Postgres12",
    );
    H.modal().findByText("Create").click();

    cy.location("pathname").should("match", /data-studio\/workspaces\/\d+/);
    Workspaces.getWorkspaceNameInput().should("have.value", "New workspace");

    Workspaces.getWorkspacePage()
      .findByText("Workspace is empty")
      .should("not.exist");
    Workspaces.getMainlandTransforms()
      .findByText("Python transform")
      .should("be.visible");
    Workspaces.getMainlandTransforms()
      .findByText("MBQL transform")
      .should("not.exist");
    Workspaces.getWorkspaceTransforms()
      .findByText("SQL transform")
      .should("be.visible")
      .click();

    Workspaces.getWorkspaceContent().within(() => {
      H.tabsShouldBe("SQL transform", ["Setup", "Agent Chat", "SQL transform"]);
    });
    Workspaces.getMergeWorkspaceButton().should("be.enabled");
    Workspaces.getRunWorkspaceButton().should("be.enabled");
    Workspaces.getTransformTargetButton().should("be.enabled");
    Workspaces.getRunTransformButton().should("be.enabled");
    Workspaces.getSaveTransformButton().should("be.disabled");

    H.NativeEditor.type(" LIMIT 2");
    Workspaces.getMergeWorkspaceButton().should("be.disabled");
    Workspaces.getRunWorkspaceButton().should("be.disabled");
    Workspaces.getTransformTargetButton().should("be.disabled");
    Workspaces.getRunTransformButton().should("be.disabled");
    Workspaces.getSaveTransformButton().should("be.enabled").click();

    Workspaces.getMergeWorkspaceButton().should("be.enabled");
    Workspaces.getRunWorkspaceButton().should("be.enabled");
    Workspaces.getTransformTargetButton().should("be.enabled");
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

    Workspaces.getWorkspaceSidebar().within(() => {
      cy.findByRole("tab", { name: "Data" }).click();
      cy.findByLabelText(/mb__isolation_/)
        .should("be.visible")
        .click();
    });

    Workspaces.getWorkspaceContent().within(() => {
      H.tabsShouldBe(/mb__isolation_/, [
        "Setup",
        "Agent Chat",
        "SQL transform",
        sourceTable,
        /mb__isolation_/,
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

    cy.findByRole("link", { name: /SQL transform/ }).click();
    H.NativeEditor.value().should(
      "eq",
      'SELECT * FROM "Schema A"."Animals" LIMIT 2',
    );
    Transforms.runTab().click();
    runTransformAndWaitForSuccess();
    Transforms.targetTab().click();
    getTableLink().should("contain.text", "transform_table").click();

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

  // it("should be able to check out existing transform into a new workspace from the workspace page", () => {
  //   createTransforms({ visit: true });
  // });
});

function createWorkspace(name: string) {
  Workspaces.getNewWorkspaceButton().click();
  H.modal().findByText("Create new workspace").should("be.visible");
  Workspaces.getNewWorkspaceNameInput().clear().type(name);
  Workspaces.getNewWorkspaceDatabaseInput().click();
  H.popover().within(() => {
    // cy.findByText("Internal Metabase Database").should("not.exist"); // TODO: uncomment once it works
    // cy.findByText("Sample Database").should("not.exist"); // TODO: uncomment once it works
    cy.findByText("Writable Postgres12").should("be.visible").click();
  });
  H.modal().findByText("Create").click();
}

function createTransforms({ visit }: { visit?: boolean } = {}) {
  createMbqlTransform({
    targetTable: TARGET_TABLE,
    visitTransform: true,
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
