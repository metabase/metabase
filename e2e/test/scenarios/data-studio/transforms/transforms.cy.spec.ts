import dedent from "ts-dedent";

import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createLibraryWithItems } from "e2e/support/test-library-data";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import type {
  CardType,
  CollectionId,
  PythonTransformTableAliases,
  TransformId,
  TransformSourceCheckpointStrategy,
  TransformTagId,
} from "metabase-types/api";

const { H } = cy;

const { ORDERS_ID } = SAMPLE_DATABASE;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_TABLE_2 = "transform_table_2";
const TARGET_SCHEMA = "Schema A";
const TARGET_SCHEMA_2 = "Schema B";
const CUSTOM_SCHEMA = "custom_schema";

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/transform").as("createTransform");
    cy.intercept("PUT", "/api/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/transform/*/table").as("deleteTransformTable");
    cy.intercept("POST", "/api/transform-tag").as("createTag");
    cy.intercept("PUT", "/api/transform-tag/*").as("updateTag");
    cy.intercept("DELETE", "/api/transform-tag/*").as("deleteTag");
    cy.intercept("POST", "/api/ee/dependencies/check_transform").as(
      "checkTransformDependencies",
    );
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("creation", () => {
    it("should be able to create and run an mbql transform", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.expectUnstructuredSnowplowEvent({
        event: "transform_create",
        event_detail: "query",
      });

      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("MBQL");

        cy.log("should auto-populate table name based on transform name...");
        cy.findByLabelText("Table name").should("have.value", "mbql");
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);

        cy.log("...unless user has manually modified the table name");
        cy.findByLabelText("Name").type(" transform");
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);

        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform and make sure its table can be queried");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
      });

      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
      H.expectUnstructuredSnowplowEvent({
        event: "transform_created",
      });
    });

    it("should not show you the library in the mini picker when building transforms (uxw-2403)", () => {
      createLibraryWithItems();

      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();
      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).should("exist");
        cy.findByText("Our analytics").should("exist");
        cy.findByText("Browse all").should("exist");
        cy.findByText("Data").should("not.exist");
      });

      H.goToMainApp();
      H.modal().button("Discard changes").click();
      H.newButton("Question").click();

      H.miniPicker().within(() => {
        cy.findByText("Our analytics").should("not.exist");
        cy.findByText("Browse all").should("exist");
        cy.findByText("Data").click();
        cy.findByText("Orders").should("exist");
      });
    });

    it("should be able to create and run a SQL transform", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("SQL query").click();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_create",
        event_detail: "native",
      });

      H.popover().findByText(DB_NAME).click();
      H.NativeEditor.type(`SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`);
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("SQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });
      H.expectUnstructuredSnowplowEvent({
        event: "transform_created",
      });

      cy.log("run the transform and make sure its table can be queried");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
      });

      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to use the data reference and snippets when writing a SQL transform", () => {
      H.createSnippet({
        name: "snippet1",
        content: "'foo'",
      });

      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("SQL query").click();
      H.popover().findByText(DB_NAME).click();

      function testDataReference() {
        cy.log("open the data reference");
        cy.findByTestId("native-query-editor-action-buttons")
          .findByLabelText("Learn about your data")
          .click();

        editorSidebar()
          .should("be.visible")
          .within(() => {
            cy.log("The current database should be opened by default");
            cy.findByText("Data Reference").should("not.exist");
            cy.findByText("Writable Postgres12").should("be.visible");
          });

        cy.findByTestId("native-query-editor-action-buttons")
          .findByLabelText("Learn about your data")
          .click();

        editorSidebar().should("not.exist");
      }

      function testSnippets() {
        cy.findByTestId("native-query-editor-action-buttons")
          .findByLabelText("SQL Snippets")
          .click();

        editorSidebar()
          .should("be.visible")
          .within(() => {
            cy.findByText("snippet1").should("be.visible");
            cy.icon("snippet").click();
          });

        H.NativeEditor.value().should("eq", "{{snippet: snippet1}}");

        cy.findByTestId("native-query-editor-action-buttons")
          .findByLabelText("SQL Snippets")
          .click();

        editorSidebar().should("not.exist");

        cy.findByTestId("native-query-editor-action-buttons")
          .findByLabelText("Preview the query")
          .click();

        H.modal().findByText("'foo'").should("be.visible");
      }

      testDataReference();
      testSnippets();
    });

    it(
      "should be possible to create and run a Python transform",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        cy.log("create a new transform");
        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("Python script").click();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_create",
          event_detail: "python",
        });

        cy.findByTestId("python-transform-top-bar")
          .findByText("Writable Postgres12")
          .click();

        cy.log("Unsupported databases should be disabled");
        H.popover()
          .findByRole("option", { name: "Sample Database" })
          .should("have.attr", "aria-disabled", "true");

        cy.log("Select database");
        H.popover().findByText(DB_NAME).click();

        getPythonDataPicker().findByText("Select a table…").click();
        H.entityPickerModal().findByText("Animals").click();

        getPythonDataPicker().within(() => {
          cy.findByText("Writable Postgres12 / Schema A").should("be.visible");
          cy.findByText("Animals").should("be.visible");
          cy.findByPlaceholderText("Enter alias").should(
            "have.value",
            "animals",
          );
          cy.findByPlaceholderText("Enter alias")
            .clear()
            .type("foo bar")
            .blur();
          cy.findByPlaceholderText("Enter alias").should(
            "have.value",
            "foo_bar",
          );
        });

        H.PythonEditor.value()
          .should("contain", "def transform(foo_bar):")
          .should(
            "contain",
            'foo_bar: DataFrame containing the data from the "Writable Postgres12.Schema A.Animals" table',
          );

        getPythonDataPicker().within(() => {
          cy.findByText("Add a table").click();
          cy.button("Select a table…").click();
        });

        H.entityPickerModal().within(() => {
          cy.log("Selecting the same table should not be possible");
          cy.findByText("Animals")
            .parent()
            .parent()
            .parent()
            .should("have.attr", "data-disabled", "true");

          cy.findByText("Schema B").click();
          cy.findByText("Animals").click();
        });

        getPythonDataPicker().within(() => {
          cy.icon("refresh").click();
          cy.findAllByPlaceholderText("Enter alias")
            .first()
            .should("have.value", "animals_1")
            .clear()
            .type("foo bar")
            .blur()
            .should("have.value", "foo_bar");
          cy.findAllByPlaceholderText("Enter alias")
            .eq(1)
            .should("have.value", "animals")
            .clear()
            .type("foo bar")
            .blur()
            .should("have.value", "foo_bar_1");
        });

        getQueryEditor().button("Save").click();

        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type("Python transform");
          cy.findByLabelText("Table name").clear().type("python_transform");
          cy.button("Save").click();
        });

        H.expectUnstructuredSnowplowEvent({
          event: "transform_created",
        });

        cy.log("run the transform and make sure its table can be queried");
        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_trigger_manual_run",
        });
        H.DataStudio.Runs.content().should(
          "contain",
          "Executing Python transform",
        );

        H.DataStudio.Transforms.settingsTab().click();
        getTableLink().click();
        H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
        H.assertQueryBuilderRowCount(1);
      },
    );

    it("should be able to create and run a transform from a question or a model", () => {
      function testCardSource({ type }: { type: CardType }) {
        H.resetSnowplow();

        cy.log("create a query in the target database");
        H.getTableId({ name: SOURCE_TABLE, databaseId: WRITABLE_DB_ID }).then(
          (tableId) =>
            H.createQuestion({
              name: `Test ${type}`,
              type,
              database: WRITABLE_DB_ID,
              query: {
                "source-table": tableId,
              },
            }),
        );

        cy.log("create a new transform");
        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("Copy of a saved question").click();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_create",
          event_detail: "saved-question",
        });

        H.pickEntity({ path: ["Our analytics", `Test ${type}`], select: true });

        getQueryEditor().button("Save").click();
        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type(`${type} transform`);
          cy.findByLabelText("Table name").type(`${type}_transform`);
          cy.button("Save").click();
          cy.wait("@createTransform");
        });

        H.expectUnstructuredSnowplowEvent({
          event: "transform_created",
        });

        cy.log("run the transform and make sure its table can be queried");
        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_trigger_manual_run",
        });

        H.DataStudio.Transforms.settingsTab().click();
        getTableLink().click();
        H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
        H.assertQueryBuilderRowCount(3);
      }

      testCardSource({ type: "question" });
      testCardSource({ type: "model" });
    });

    it("should be possible to convert an MBQL transform to a SQL transform", () => {
      const EXPECTED_QUERY = `SELECT
  "Schema Q"."Animals"."name" AS "name",
  "Schema Q"."Animals"."score" AS "score"
FROM
  "Schema Q"."Animals"
LIMIT
  5`;

      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.clickEditDefinition();
      cy.url().should("include", "/edit");

      getQueryEditor().findByLabelText("View SQL").click();
      H.sidebar().should("be.visible");
      H.NativeEditor.value().should("eq", EXPECTED_QUERY);

      H.sidebar().findByText("Convert this transform to SQL").click();
      H.sidebar().should("be.visible");

      H.NativeEditor.value().should("eq", EXPECTED_QUERY);
      getQueryEditor().button("Save").click();

      cy.log("run the transform and make sure its table can be queried");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
      });

      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should not include absolute-max-results LIMIT in SQL preview for MBQL transforms", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.clickEditDefinition();
      cy.url().should("include", "/edit");

      getQueryEditor().findByLabelText("View SQL").click();
      H.sidebar()
        .should("be.visible")
        .and("not.contain", /\bLIMIT\b/i);
    });

    it("should not allow to overwrite an existing table when creating a transform", () => {
      cy.log("open the new transform page");
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      cy.log("set the query");
      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("MBQL transform");
        cy.findByLabelText("Table name").clear().type(SOURCE_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });
      H.modal()
        .findByText("A table with that name already exists.")
        .should("be.visible");
    });

    it("should be able to create a new schema when saving a transform", () => {
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("MBQL transform");
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);
        cy.findByLabelText("Schema").clear().type(CUSTOM_SCHEMA);
      });
      H.popover().findByText("Create new schema").click();
      H.modal().within(() => {
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink()
        .should("have.text", CUSTOM_SCHEMA)
        .should("have.attr", "aria-disabled", "true")
        .realHover();
      H.tooltip()
        .should("be.visible")
        .should(
          "have.text",
          "This schema will be created when the transform runs",
        );
      getTableLink({ isActive: false })
        .should("have.text", TARGET_TABLE)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink()
        .should("have.text", CUSTOM_SCHEMA)
        .should("have.attr", "aria-disabled", "false")
        .realHover();
      getTableLink().click();
      H.queryBuilderHeader().findByText(CUSTOM_SCHEMA).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to create a new table in an existing transform when saving a transform", () => {
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();
      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("MBQL transform");
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink()
        .should("have.text", TARGET_SCHEMA)
        .should("have.attr", "aria-disabled", "false");
      getTableLink({ isActive: false })
        .should("have.text", TARGET_TABLE)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink().should("have.attr", "aria-disabled", "false");
      getTableLink().should("have.attr", "aria-disabled", "false").click();
      H.assertQueryBuilderRowCount(3);
    });

    it("should not be possible to create an mbql transform from a table from an unsupported database", () => {
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.miniPicker().within(() => {
        // no sample db in mini picker
        cy.findByText(/Writable Postgres/).should("be.visible");
        cy.findByText("Sample Database").should("not.exist");
      });

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Databases").click();
        cy.findAllByTestId("picker-item")
          .contains("Sample Database")
          .should("have.attr", "data-disabled", "true");
        cy.findAllByTestId("picker-item")
          .contains(/Writable Postgres/)
          .should("not.have.attr", "data-disabled");
      });
    });

    it("should not be possible to create an mbql transform from metrics", () => {
      H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
        (tableId) =>
          H.createQuestion({
            name: "Animal Metric",
            type: "metric",
            query: {
              "source-table": tableId,
              aggregation: [["count"]],
            },
          }),
      );

      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText(/metric/i).should("not.exist");
      });

      H.miniPickerHeader().click(); // go back
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Our analytics").click();
        cy.findAllByTestId("picker-item")
          .contains("Animal Metric")
          .should("have.attr", "data-disabled", "true");
      });
    });

    it("should not be possible to create a sql transform from a table from an unsupported database", () => {
      visitTransformListPage();
      cy.button("Create a transform").click();

      H.popover().findByText("SQL query").click();

      cy.findByTestId("gui-builder-data")
        .findByText("Writable Postgres12")
        .click();

      H.popover()
        .findByRole("option", { name: "Sample Database" })
        .should("have.attr", "aria-disabled", "true")
        .click();

      cy.log("Clicking the disabled item does not close the popover");
      H.popover().should("be.visible");
    });

    it("not show the 'Show details' buttons in ID columns (metabase#64473)", () => {
      const databaseId = WRITABLE_DB_ID;
      const sourceTable = SOURCE_TABLE;
      const nameColumn = "name";

      H.getTableId({ databaseId, name: sourceTable }).then((tableId) => {
        H.getFieldId({ tableId, name: nameColumn }).then((nameColumnId) => {
          // Make name a key
          cy.request("PUT", `/api/field/${nameColumnId}`, {
            semantic_type: "type/PK",
          });
        });
      });

      createMbqlTransform({
        databaseId,
        sourceTable,
        visitTransform: true,
      });

      H.DataStudio.Transforms.clickEditDefinition();

      getQueryEditor().within(() => {
        cy.findByTestId("run-button").eq(0).click();
        cy.findByTestId("loading-indicator").should("not.exist");

        cy.findAllByTestId("detail-shortcut").should("not.exist");
      });
    });

    it("should not be possible to create a transform from a question or a model that is based of an unsupported database", () => {
      function testCardSource({ type }: { type: CardType }) {
        cy.log("create a query in the target database");
        H.createQuestion({
          name: `Test ${type}`,
          type,
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
          },
        });

        cy.log("create a new transform");
        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("Copy of a saved question").click();
        H.entityPickerModal().within(() => {
          cy.findByText("Our analytics").click();
          cy.findByText(`Test ${type}`)
            .closest("a")
            .should("have.attr", "data-disabled", "true");
        });
      }

      testCardSource({ type: "question" });
      testCardSource({ type: "model" });
    });

    it("should not auto-pivot query results for MBQL transforms", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      cy.log("build a query with 1 aggregation and 2 breakouts");
      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      H.popover().findByText("Count of rows").click();
      H.getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      H.popover().findByText("Name").click();
      H.getNotebookStep("summarize")
        .findByTestId("breakout-step")
        .icon("add")
        .click();
      H.popover().findByText("Score").click();
      H.runButtonOverlay().click();

      cy.log("verify that no pivoting is applied");
      H.tableInteractiveHeader().within(() => {
        cy.findByText("Name").should("be.visible");
        cy.findByText(/Score/).should("be.visible");
        cy.findByText("Count").should("be.visible");
      });
    });

    it("should show the metabot button", () => {
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();
      cy.findByRole("button", { name: /Chat with Metabot/ }).should(
        "be.visible",
      );
    });
  });

  describe("name", () => {
    it("should be able to edit the name after creation", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.header()
        .findByPlaceholderText("Name")
        .clear()
        .type("New name")
        .blur();
      H.undoToast().findByText("Transform name updated").should("be.visible");
      H.DataStudio.Transforms.header()
        .findByPlaceholderText("Name")
        .should("have.value", "New name");
    });
  });

  describe("ownership", () => {
    it("should be able to view and manage transform ownership", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("verify the ownership section is displayed");
      getTransformsTargetContent().within(() => {
        cy.findByText("Ownership").should("be.visible");
        cy.findByText("Specify who is responsible for this transform.").should(
          "be.visible",
        );
        cy.findByText("Owner").should("be.visible");
      });

      cy.log("change the owner to another user");
      getTransformsTargetContent().within(() => {
        cy.findByLabelText("Owner").click();
      });
      H.popover().findByText("Robert Tableton").click();
      cy.wait("@updateTransform");
      H.undoToast().findByText("Transform owner updated").should("be.visible");
      H.undoToast().icon("close").click();

      cy.log("set an external email as owner");
      getTransformsTargetContent().within(() => {
        cy.findByLabelText("Owner").click();
        cy.findByLabelText("Owner").clear().type("external@example.com");
      });
      H.popover().findByText("external@example.com").click();
      cy.wait("@updateTransform");
      H.undoToast().findByText("Transform owner updated").should("be.visible");
      H.undoToast().icon("close").click();

      cy.log("clear the owner");
      getTransformsTargetContent().within(() => {
        cy.findByLabelText("Owner").click();
      });
      H.popover().findByText("No owner").click();
      cy.wait("@updateTransform");
      H.undoToast().findByText("Transform owner updated").should("be.visible");
    });
  });

  describe("tags", () => {
    it("should be able to add and remove tags", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      getTagsInput().click();

      H.popover().findByText("hourly").click();
      cy.wait("@updateTransform");
      assertOptionSelected("hourly");
      assertOptionNotSelected("daily");

      H.popover().findByText("daily").click();
      cy.wait("@updateTransform");
      assertOptionSelected("hourly");
      assertOptionSelected("daily");
      H.expectUnstructuredSnowplowEvent({
        event: "transform_run_tags_updated",
        result: "success",
        transformId: 1,
        event_detail: "tag_added",
      });

      getTagsInput().type("{backspace}");
      assertOptionSelected("hourly");
      assertOptionNotSelected("daily");

      H.expectUnstructuredSnowplowEvent({
        event: "transform_run_tags_updated",
        result: "success",
        transformId: 1,
        event_detail: "tag_removed",
      });
    });

    it("should be able to create tags inline", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      getTagsInput().type("New tag");
      H.popover().findByText("New tag").click();
      cy.wait("@createTag");
      H.undoToast().should("contain.text", "Transform tags updated");
    });

    it("should be able to update tags inline", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      getTagsInput().click();
      H.popover()
        .findByText("hourly")
        .parent()
        .findByLabelText("Rename tag")
        .click({ force: true });
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("daily_changed");
        cy.button("Save").click();
        cy.wait("@updateTag");
      });

      getTagsInput().click();
      H.popover().findByText("daily_changed").should("be.visible");
    });

    it("should be able to delete tags inline", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      getTagsInput().click();
      H.popover()
        .findByText("hourly")
        .parent()
        .findByLabelText("Delete tag")
        .click({ force: true });
      H.modal().within(() => {
        cy.button("Delete tag").click();
        cy.wait("@deleteTag");
      });
      H.undoToast().should("contain.text", "Transform tags updated");

      getTagsInput().click();
      H.popover().within(() => {
        cy.findByText("daily").should("be.visible");
        cy.findByText("hourly").should("not.exist");
      });
    });

    it("should update tags on all transforms when deleting them from another transform", () => {
      createMbqlTransform({ name: "Transform B" });
      createMbqlTransform({
        name: "Transform A",
        visitTransform: true,
      });

      cy.log("Add new tag to transform A");
      H.DataStudio.Transforms.runTab().click();
      getTagsInput().type("New tag");
      H.popover().findByText("New tag").click();
      cy.wait("@createTag");

      cy.log("Navigate to transform B");
      H.DataStudio.nav().findByRole("link", { name: "Transforms" }).click();
      cy.findByRole("treegrid").findByText("Transform B").click();

      cy.log("Remove the new tag from transform B");
      H.DataStudio.Transforms.runTab().click();
      getTagsInput().click();
      H.popover()
        .findByText("New tag")
        .parent()
        .findByLabelText("Delete tag")
        .click({ force: true });
      H.modal().within(() => {
        cy.button("Delete tag").click();
        cy.wait("@deleteTag");
      });

      cy.log("Navigate to transform A");
      getTransformsNavLink().click();
      cy.findByRole("treegrid").findByText("Transform A").click();

      cy.log("The tag should be gone");
      H.DataStudio.Transforms.runTab().click();
      getTagsInput()
        .parent()
        // Select the tag pill
        .get("[data-with-remove=true]")
        .should("not.exist");
    });
  });

  describe("incremental settings inline editing", () => {
    it("should update incremental settings inline when toggling the switch", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("Toggle incremental on");
      isIncrementalSwitchDisabled();
      getIncrementalSwitch().click();
      cy.wait("@updateTransform");
      isIncrementalSwitchEnabled();
      H.undoToast().should(
        "contain.text",
        "Incremental transformation settings updated",
      );

      cy.log("Toggle incremental off");
      getIncrementalSwitch().click();
      cy.wait("@updateTransform");
      isIncrementalSwitchDisabled();
      H.undoToast().should(
        "contain.text",
        "Incremental transformation settings updated",
      );
    });

    it("should debounce inline updates and not make a request when toggling the same field twice", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("Toggle incremental on and immediately off");
      isIncrementalSwitchDisabled();

      // Stub the updateTransform call to track how many times it's called
      let updateCallCount = 0;
      cy.intercept("PUT", "/api/transform/*", (req) => {
        updateCallCount++;
        req.continue();
      }).as("updateTransformCounted");

      // Toggle on then immediately off (within debounce window)
      getIncrementalSwitch().click();
      getIncrementalSwitch().click();

      // Wait for debounce period (300ms) plus some buffer
      cy.wait(500);

      cy.log(
        "Verify no request was made since we toggled back to original value",
      );
      // The switch should be back to unchecked
      isIncrementalSwitchDisabled();
      // No request should have been made
      cy.wrap(null).then(() => {
        expect(updateCallCount).to.equal(0);
      });
    });

    it("should handle sequential changes correctly when first update is in progress", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("Verify initial state");
      isIncrementalSwitchDisabled();

      let requestCount = 0;

      // Intercept and delay the first request using a Promise
      cy.intercept("PUT", "/api/transform/*", (req) => {
        requestCount++;
        if (requestCount === 1) {
          // Delay the first request by 1 second
          req.reply({
            body: req.body,
            delay: 1000,
          });
        } else {
          // Let subsequent requests through normally
          req.continue();
        }
      }).as("updateTransformDelayed");

      cy.log("Toggle incremental on (first change)");
      getIncrementalSwitch().click();

      cy.log(
        "Wait for debounce plus a bit, then select checkpoint field (second change)",
      );
      // Wait for first request to start (debounce 300ms + buffer)
      cy.wait(400);

      // Make a second change while first is still in progress
      // Select any available checkpoint field
      getFieldPicker().scrollIntoView().should("be.visible");
      getFieldPicker().click();

      // Click the first available option in the popover
      H.popover().findAllByRole("option").first().click();

      cy.log("Wait for both requests to complete");
      cy.wait("@updateTransformDelayed");
      cy.wait("@updateTransformDelayed");

      cy.log(
        "Verify final state - incremental on with checkpoint field selected",
      );
      isIncrementalSwitchEnabled();
      // Verify a field was selected (should not show placeholder text)
      getFieldPicker().should("not.contain.text", "Pick a field");

      cy.log("Verify both requests were made");
      cy.wrap(null).then(() => {
        expect(requestCount).to.equal(2);
      });
    });

    it("should update source strategy and checkpoint field inline", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("Enable incremental transformation");
      getIncrementalSwitch().click();
      cy.wait("@updateTransform");

      cy.log("Source strategy and checkpoint field should be visible");
      // The source strategy select should be visible
      // (Currently only one option "checkpoint" is available, so select might not be shown)
      // The checkpoint field select should be visible
      getFieldPicker().scrollIntoView().should("be.visible");

      cy.log("Select a checkpoint field");
      getFieldPicker().click();
      // Click the first available option in the popover
      H.popover().findAllByRole("option").first().click();
      cy.wait("@updateTransform");
      H.undoToast().should(
        "contain.text",
        "Incremental transformation settings updated",
      );

      cy.log("Verify the field was selected");
      // Verify a field was selected (should not show placeholder text)
      getFieldPicker().should("not.contain.text", "Pick a field");
    });

    it("should rollback values when API returns an error", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("Verify initial state");
      isIncrementalSwitchDisabled();

      cy.log("Intercept and force the update to fail");
      cy.intercept("PUT", "/api/transform/*", {
        statusCode: 500,
        body: { message: "Internal server error" },
      }).as("updateTransformError");

      cy.log("Toggle incremental on");
      getIncrementalSwitch().click();

      cy.log("Wait for the failed request");
      cy.wait("@updateTransformError");

      cy.log("Verify error toast is shown");
      H.undoToast().should(
        "contain.text",
        "Failed to update incremental transformation settings",
      );

      cy.log("Verify the switch rolled back to unchecked state");
      isIncrementalSwitchDisabled();
    });

    it("should rollback values when network fails", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("Verify initial state");
      isIncrementalSwitchDisabled();

      cy.log("Intercept and simulate network failure");
      cy.intercept("PUT", "/api/transform/*", {
        forceNetworkError: true,
      }).as("updateTransformNetworkError");

      cy.log("Toggle incremental on");
      getIncrementalSwitch().click();

      cy.log("Wait for debounce period");
      cy.wait(500);

      cy.log("Verify error toast is shown");
      H.undoToast().should(
        "contain.text",
        "Failed to update incremental transformation settings",
      );

      cy.log("Verify the switch rolled back to unchecked state");
      isIncrementalSwitchDisabled();
    });

    it("should not process pending updates after an error occurs", () => {
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("Verify initial state");
      isIncrementalSwitchDisabled();

      let requestCount = 0;
      cy.log("Intercept and fail the first request after a delay");
      cy.intercept("PUT", "/api/transform/*", (req) => {
        requestCount++;
        if (requestCount === 1) {
          // First request fails after a delay to ensure second change happens while it's in progress
          req.reply({
            statusCode: 500,
            body: { message: "Internal server error" },
            delay: 500,
          });
        } else {
          // Subsequent requests should not happen
          req.continue();
        }
      }).as("updateTransformConditional");

      cy.log("Toggle incremental on (first change)");
      getIncrementalSwitch().click();

      cy.log("Wait for debounce, then toggle again (second change)");
      cy.wait(400);
      getIncrementalSwitch().click();

      cy.log("Wait for the error");
      cy.wait("@updateTransformConditional");

      cy.log("Wait a bit to ensure no second request is made");
      cy.wait(500);

      cy.log("Verify only one request was made");
      cy.wrap(null).then(() => {
        expect(requestCount).to.equal(1);
      });

      cy.log("Verify error toast is shown");
      H.undoToast().should(
        "contain.text",
        "Failed to update incremental transformation settings",
      );

      cy.log("Verify the switch is back to unchecked");
      isIncrementalSwitchDisabled();
    });
  });

  describe("targets", () => {
    it("should be able to change the target before running a transform", () => {
      cy.log("create but do not run the transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("modify the transform before running");
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Schema").click();
      });
      H.popover().findByText(TARGET_SCHEMA_2).click();
      H.modal().within(() => {
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });
      getSchemaLink()
        .should("have.text", TARGET_SCHEMA_2)
        .should("have.attr", "aria-disabled", "false");
      getTableLink({ isActive: false })
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink()
        .should("have.text", TARGET_SCHEMA_2)
        .should("have.attr", "aria-disabled", "false");
      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "false")
        .click();
      H.queryBuilderHeader().findByText(TARGET_SCHEMA_2).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be possible to create a new schema", () => {
      cy.log("create but do not run the transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("modify the transform before running");
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Schema").clear().type(CUSTOM_SCHEMA);
      });
      H.popover().findByText("Create new schema").click();
      H.modal().within(() => {
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });
      getSchemaLink()
        .should("have.text", CUSTOM_SCHEMA)
        .should("have.attr", "aria-disabled", "true");
      getTableLink({ isActive: false })
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink()
        .should("have.text", CUSTOM_SCHEMA)
        .should("have.attr", "aria-disabled", "false");
      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "false")
        .click();
      H.queryBuilderHeader().findByText(CUSTOM_SCHEMA).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target after running a transform and keep the old target", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      cy.log("modify the transform after running");
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("Keep transform_table").should("be.checked");
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE_2);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });
      getSchemaLink()
        .should("have.text", TARGET_SCHEMA)
        .should("have.attr", "aria-disabled", "false");
      getTableLink({ isActive: false })
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the new table");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink()
        .should("have.text", TARGET_SCHEMA)
        .should("have.attr", "aria-disabled", "false");
      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "false")
        .click();
      H.queryBuilderHeader()
        .findByText("Transform Table 2")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);

      cy.log("verify that the original question still works");
      visitTableQuestion();
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target after running a transform and delete the old target", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      cy.log("modify the transform after running");
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Delete transform_table").click();
        cy.button("Change target and delete old table").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@updateTransform");
      });
      getSchemaLink()
        .should("have.text", TARGET_SCHEMA)
        .should("have.attr", "aria-disabled", "false");
      getTableLink({ isActive: false })
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the new table");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink()
        .should("have.text", TARGET_SCHEMA)
        .should("have.attr", "aria-disabled", "false");
      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "false")
        .click();
      H.queryBuilderHeader()
        .findByText("Transform Table 2")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);

      cy.log("verify that the original question does not work");
      visitTableQuestion();
      assertTableDoesNotExistError();
    });

    it("should be able to delete the target and restore the same target back", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      cy.log("delete the old target without creating the new one");
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Delete transform_table").click();
        cy.button("Change target and delete old table").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@updateTransform");
      });

      cy.log("change the target back to the original one");
      getTransformsTargetContent().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });

      cy.log("run the transform to re-create the original target");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      cy.log("verify the target is available");
      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should not allow to overwrite an existing table when changing the target", () => {
      createMbqlTransform({ visitTransform: true });

      cy.log("change the target to an existing table");
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").clear().type(SOURCE_TABLE);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
        cy.findByText("A table with that name already exists.").should(
          "be.visible",
        );
      });
    });
  });

  describe("metadata", () => {
    it("should be able to edit table metadata after table creation", () => {
      cy.log("before table creation");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent()
        .findByText("Edit this table's metadata")
        .should("not.exist");

      cy.log("after table creation");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.DataStudio.Transforms.settingsTab().click();
      getTransformsTargetContent()
        .findByText("Edit this table's metadata")
        .click();
      H.DataModel.TableSection.clickField("Name");
      H.DataModel.FieldSection.getNameInput().clear().type("New name").blur();
      cy.wait("@updateField");

      cy.log("verify query metadata");
      cy.go("back");
      cy.go("back");
      getTableLink().click();
      H.assertTableData({ columns: ["New name", "Score"] });
    });

    it("should be able to see the target schema", () => {
      cy.log("before table creation");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink().should("have.text", TARGET_SCHEMA);
      getSchemaLink().click();
      H.main().within(() => {
        cy.findByText("Animals").should("be.visible");
        cy.findByText("Transform Table").should("not.exist");
      });

      cy.log("after table creation");
      cy.go("back");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.DataStudio.Transforms.settingsTab().click();
      getSchemaLink().click();
      H.main().within(() => {
        cy.findByText("Animals").should("be.visible");
        cy.findByText("Transform Table").should("be.visible");
      });
    });

    it("should be able to see the target database", () => {
      cy.log("before table creation");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.settingsTab().click();
      getDatabaseLink().should("have.text", DB_NAME);
      getDatabaseLink().click();
      H.main().within(() => {
        cy.findByText(TARGET_SCHEMA).should("be.visible");
        cy.findByText(TARGET_SCHEMA_2).should("be.visible");
      });

      cy.log("after table creation");
      cy.go("back");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.DataStudio.Transforms.settingsTab().click();
      getDatabaseLink().click();
      H.main().within(() => {
        cy.findByText(TARGET_SCHEMA).should("be.visible");
        cy.findByText(TARGET_SCHEMA_2).should("be.visible");
      });
    });
  });

  describe("queries", () => {
    it("should show SQL query transforms in view-only mode", () => {
      cy.log("create a new transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        visitTransform: true,
      });
      H.NativeEditor.get().should("have.attr", "contenteditable", "false");
      H.NativeEditor.get().should("have.attr", "aria-readonly", "true");
      H.DataStudio.Transforms.getEditDefinitionLink().should(
        "have.attr",
        "href",
        "/data-studio/transforms/1/edit",
      );
    });

    it("should show MBQL transforms in view-only mode", () => {
      cy.log("create a new transform");
      createMbqlTransform({ visitTransform: true });
      H.getNotebookStep("data")
        .findByText("Animals")
        .closest("button")
        .should("be.disabled");
      H.DataStudio.Transforms.getEditDefinitionLink().should(
        "have.attr",
        "href",
        "/data-studio/transforms/1/edit",
      );
    });

    it("should be able to update a MBQL query", () => {
      cy.log("create a new transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("visit edit mode");
      H.DataStudio.Transforms.clickEditDefinition();
      cy.url().should("include", "/edit");

      cy.log("update the query");
      H.getNotebookStep("data").button("Filter").click();
      H.popover().within(() => {
        cy.findByText("Name").click();
        cy.findByText("Duck").click();
        cy.button("Add filter").click();
      });

      getQueryEditor().button("Save").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });

    it("should be able to update a SQL query", () => {
      cy.log("create a new transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        visitTransform: true,
      });

      cy.log("visit edit mode");
      H.DataStudio.Transforms.clickEditDefinition();
      cy.url().should("include", "/edit");

      cy.log("update the query");
      H.NativeEditor.type(" WHERE name = 'Duck'");
      getQueryEditor().button("Save").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });

    it("should be possible to continue editing a transform after closing check dependencies modal (metabase#68272)", () => {
      const transformTableName = "output_table";
      const dependentCardName = "Question depending on transform";

      cy.log("create MBQL transform with name and score columns");
      H.getTableId({ name: SOURCE_TABLE, databaseId: WRITABLE_DB_ID }).then(
        (sourceTableId) => {
          H.getFieldId({ tableId: sourceTableId, name: "name" }).then(
            (nameFieldId) => {
              H.getFieldId({ tableId: sourceTableId, name: "score" }).then(
                (scoreFieldId) => {
                  H.createTransform(
                    {
                      name: "MBQL transform with deps",
                      source: {
                        type: "query",
                        query: {
                          database: WRITABLE_DB_ID,
                          type: "query",
                          query: {
                            "source-table": sourceTableId,
                            fields: [
                              ["field", nameFieldId, null],
                              ["field", scoreFieldId, null],
                            ],
                          },
                        },
                      },
                      target: {
                        type: "table",
                        database: WRITABLE_DB_ID,
                        name: transformTableName,
                        schema: TARGET_SCHEMA,
                      },
                    },
                    { wrapId: true },
                  );
                },
              );
            },
          );
        },
      );

      cy.get<TransformId>("@transformId").then((transformId) => {
        cy.log("run the transform to create the output table");
        cy.request("POST", `/api/transform/${transformId}/run`);
        H.waitForSucceededTransformRuns();
        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
          tableName: transformTableName,
        });

        cy.log("create a question that depends on the score column");
        H.getTableId({
          databaseId: WRITABLE_DB_ID,
          name: transformTableName,
        }).then((tableId) => {
          H.createQuestion({
            name: dependentCardName,
            database: WRITABLE_DB_ID,
            query: {
              "source-table": tableId,
              filter: [
                ">",
                ["field", "score", { "base-type": "type/Integer" }],
                10,
              ],
            },
          });
        });

        H.visitTransform(transformId);

        cy.log("remove score column (breaking change)");
        H.DataStudio.Transforms.clickEditDefinition();
        H.getNotebookStep("data").findByLabelText("Pick columns").click();
        H.popover().findByLabelText("Score").click();
        H.DataStudio.Transforms.saveChangesButton().click();

        cy.wait("@checkTransformDependencies");

        H.modal().within(() => {
          cy.findByText(
            "These changes will break some other things. Save anyway?",
          ).should("be.visible");
          cy.findByText(dependentCardName).should("be.visible");

          cy.log("cancel to continue editing");
          cy.button("Cancel").click();
        });

        H.DataStudio.Transforms.editDefinitionButton().should("not.exist");
        H.DataStudio.Transforms.saveChangesButton()
          .should("be.visible")
          .and("be.enabled");

        H.getNotebookStep("data").findByLabelText("Pick columns").click();
        H.popover().findByLabelText("Name").should("be.disabled");
        H.popover().findByLabelText("Score").should("not.be.checked");
      });
    });

    it("should be able to update a Python query", { tags: ["@python"] }, () => {
      H.setPythonRunnerSettings();
      cy.log("create a new transform");
      H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
        (id) => {
          createPythonTransform({
            body: dedent`
          import pandas as pd

          def transform(foo):
            return pd.DataFrame([{"foo": 42 }])
        `,
            sourceTables: { foo: id },
            visitTransform: true,
          });
        },
      );

      cy.log("enter edit mode");
      H.DataStudio.Transforms.clickEditDefinition();

      cy.log("update the query");
      H.PythonEditor.type("{backspace}{backspace}{backspace} + 10 }])");
      getQueryEditor().button("Save").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });

    it(
      "should show Python transforms in view-only mode",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        cy.log("create a new Python transform");
        H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
          (id) => {
            createPythonTransform({
              body: dedent`
              import pandas as pd

              def transform(foo):
                return pd.DataFrame([{"foo": 42 }])
            `,
              sourceTables: { foo: id },
              visitTransform: true,
            });
          },
        );

        cy.log("should be in read-only mode by default");
        H.DataStudio.Transforms.getEditDefinitionLink().should(
          "have.attr",
          "href",
          "/data-studio/transforms/1/edit",
        );

        cy.log("sidebar should be hidden in read-only mode");
        cy.findByTestId("python-data-picker").should("not.exist");

        cy.log("results panel should be hidden in read-only mode");
        H.DataStudio.Transforms.pythonResults().should("not.exist");

        cy.log("library buttons should be hidden in read-only mode");
        cy.findByLabelText("Import common library").should("not.exist");
        cy.findByLabelText("Edit common library").should("not.exist");
      },
    );

    it(
      "should transition from read-only to edit mode for Python transforms",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        cy.log("create a new Python transform");
        H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
          (id) => {
            createPythonTransform({
              body: dedent`
              import pandas as pd

              def transform(foo):
                return pd.DataFrame([{"foo": 42 }])
            `,
              sourceTables: { foo: id },
              visitTransform: true,
            });
          },
        );

        cy.log("click Edit definition to enter edit mode");
        H.DataStudio.Transforms.clickEditDefinition();
        cy.url().should("include", "/edit");

        cy.log("sidebar should be visible in edit mode");
        cy.findByTestId("python-data-picker").should("be.visible");

        cy.log("results panel should be visible in edit mode");
        H.DataStudio.Transforms.pythonResults().should("be.visible");

        cy.log("Edit definition button should be hidden in edit mode");
        H.DataStudio.Transforms.editDefinitionButton().should("not.exist");
      },
    );

    it(
      "should return to read-only mode after saving a Python transform",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        cy.log("create a new Python transform");
        H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
          (id) => {
            createPythonTransform({
              body: dedent`
              import pandas as pd

              def transform(foo):
                return pd.DataFrame([{"foo": 42 }])
            `,
              sourceTables: { foo: id },
              visitTransform: true,
            });
          },
        );

        cy.log("enter edit mode");
        H.DataStudio.Transforms.clickEditDefinition();
        cy.url().should("include", "/edit");

        cy.log("make a change to trigger dirty state");
        H.PythonEditor.type(" # comment");

        cy.log("save the transform");
        getQueryEditor().button("Save").click();
        cy.wait("@updateTransform");

        cy.log("should return to read-only mode after save");
        cy.url().should("not.include", "/edit");
        H.DataStudio.Transforms.editDefinitionButton().should("be.visible");
        cy.findByTestId("python-data-picker").should("not.exist");
        H.DataStudio.Transforms.pythonResults().should("not.exist");
      },
    );

    describe("query complexity warning", () => {
      it("should show complexity warning modal when saving a complex SQL query", () => {
        cy.log("create a simple SQL transform");
        createSqlTransform({
          sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
          visitTransform: true,
          sourceCheckpointStrategy: { type: "checkpoint" },
        });

        cy.log("visit edit mode and change to a complex query with LIMIT");
        H.DataStudio.Transforms.clickEditDefinition();
        cy.url().should("include", "/edit");

        H.NativeEditor.type(" LIMIT 10");
        getQueryEditor().button("Save").click();

        handleQueryComplexityWarningModal("cancel");
        cy.log("verify modal is closed and still in edit mode");
        H.modal().should("not.exist");
        cy.url().should("include", "/edit");
        cy.get("@updateTransform.all").should("have.length", 0);

        cy.log("Save anyway");
        getQueryEditor().button("Save").click();
        handleQueryComplexityWarningModal("save");

        cy.wait("@updateTransform");
        cy.url().should("not.include", "/edit");
      });

      it("should confirm incremental settings change if query is complex", () => {
        createSqlTransform({
          sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}" LIMIT 10`,
          sourceCheckpointStrategy: { type: "checkpoint" },
          visitTransform: true,
        });
        H.DataStudio.Transforms.settingsTab().click();

        cy.log("Toggle incremental on");
        isIncrementalSwitchDisabled();
        getIncrementalSwitch().click();

        handleQueryComplexityWarningModal("cancel");

        cy.log("Verify that the switch is still off");
        isIncrementalSwitchDisabled();

        cy.log("Toggle incremental on");
        getIncrementalSwitch().click();
        handleQueryComplexityWarningModal("save");

        cy.wait("@updateTransform");
        isIncrementalSwitchEnabled();
        H.undoToast().should(
          "contain.text",
          "Incremental transformation settings updated",
        );
      });

      it("should show complexity warning with danger button in create transform modal when enabling incremental with complex query", () => {
        cy.log("create a new SQL transform with a complex query");
        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("SQL query").click();
        H.popover().findByText(DB_NAME).click();

        H.NativeEditor.type(
          `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}" LIMIT 10`,
        );

        getQueryEditor().button("Save").click();

        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type("Complex SQL transform");
          cy.findByLabelText("Table name").clear().type(TARGET_TABLE);

          cy.log("Enable incremental transformation");
          getIncrementalSwitch().click();

          cy.log("Verify complexity warning appears inline");
          cy.findByTestId("query-complexity-warning")
            .scrollIntoView()
            .should("be.visible");

          cy.log("Verify the submit button is styled as danger (red)");
          cy.findByRole("button", { name: "Save anyway" })
            .scrollIntoView()
            .should("have.css", "background-color", "rgb(209, 44, 41)");
        });
      });
    });
  });

  describe("runs", () => {
    it("should be able to navigate to a list of runs", () => {
      cy.log("create and run a transform");
      createMbqlTransform({
        targetTable: TARGET_TABLE,
        visitTransform: true,
      });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      cy.log("create and run another transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: TARGET_TABLE_2,
        visitTransform: true,
      });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();

      cy.log("assert that the list is filtered by the current transform");
      getRunListLink().click();
      getTransformRunTable().within(() => {
        cy.findByText("SQL transform").should("be.visible");
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("Success").should("be.visible");
        cy.findByText("Manual").should("be.visible");
      });
    });

    it("should display the error message from a failed run", () => {
      createSqlTransform({
        sourceQuery: "SELECT * FROM abc",
        visitTransform: true,
      });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForFailure();
      getRunErrorInfoButton().click();
      H.modal().should("contain.text", 'relation "abc" does not exist');
    });
  });

  describe("deletion", () => {
    it("should be able to delete a transform before creating the table", () => {
      cy.log("create a transform without running");
      createMbqlTransform({ visitTransform: true });

      cy.log("delete the transform");
      H.DataStudio.Transforms.header().icon("ellipsis").click();
      H.popover().findByText("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("not.exist");
        cy.findByLabelText("Delete the transform and the table").should(
          "not.exist",
        );
        cy.button("Delete transform").click();
        cy.wait("@deleteTransform");
      });
      getTransformsNavLink().click();
      getTransformsList().should("be.visible");
      getTransformsList().findByText("MBQL transform").should("not.exist");
    });

    it("should be able to delete a transform and keep the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().should("have.attr", "aria-disabled", "false");

      cy.log("delete the transform but keep the table");
      H.DataStudio.Transforms.header().icon("ellipsis").click();
      H.popover().findByText("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("be.checked");
        cy.button("Delete transform only").click();
        cy.wait("@deleteTransform");
      });
      getTransformsList().should("be.visible");

      cy.log("make sure the table still exists");
      visitTableQuestion();
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to delete a transform and delete the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      H.DataStudio.Transforms.runTab().click();
      runTransformAndWaitForSuccess();
      H.DataStudio.Transforms.settingsTab().click();
      getTableLink().should("have.attr", "aria-disabled", "false");

      cy.log("delete the transform and the table");
      H.DataStudio.Transforms.header().icon("ellipsis").click();
      H.popover().findByText("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform and the table").click();
        cy.button("Delete transform and table").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@deleteTransform");
      });
      getTransformsList().should("be.visible");

      cy.log("make sure the table is deleted");
      visitTableQuestion();
      assertTableDoesNotExistError();
    });
  });

  describe("cancelation", () => {
    function createSlowTransform(seconds: number = 100) {
      H.createTransform(
        {
          name: "Slow transform",
          source: {
            type: "query",
            query: {
              database: WRITABLE_DB_ID,
              type: "native",
              native: {
                query: `SELECT name, cast(pg_sleep(${seconds}) as text) as slow FROM "Schema A"."Animals" LIMIT 1`,
              },
            },
          },
          target: {
            type: "table",
            database: WRITABLE_DB_ID,
            name: TARGET_TABLE,
            schema: TARGET_SCHEMA,
          },
          tag_ids: [],
        },
        { visitTransform: true },
      );
    }

    it("should be possible to cancel a transform from the transform page", () => {
      createSlowTransform();
      H.DataStudio.Transforms.runTab().click();
      getRunButton().click();
      getRunButton().should("have.text", "Running now…");
      getRunStatus().should("have.text", "Run in progress…");

      getCancelButton().click();
      H.modal().button("Yes").click();

      getRunButton().should("have.text", "Canceling…");
      getRunStatus().should("have.text", "Canceling…");

      // We need to pass a timeout here since canceling a transform can
      // take a while on the back end
      getRunButton({ timeout: 40_000 }).should("have.text", "Canceled");
      getRunStatus().should("contain", "Last run was canceled");
    });

    it("should be possible to cancel a transform from the runs page", () => {
      createSlowTransform();
      H.DataStudio.Transforms.runTab().click();
      getRunButton().click();
      getRunButton().should("have.text", "Running now…");
      getRunStatus().should("have.text", "Run in progress…");

      getRunsNavLink().click();
      getTransformRunTable().findByText("In progress").click();
      cy.findByTestId("run-list-sidebar").button("Cancel run").click();
      H.modal().button("Yes").click();

      getTransformRunTable().findByText("Canceling").should("exist");
      getTransformRunTable()
        .findByText("Canceled", { timeout: 30_000 })
        .should("exist");
    });

    it("should show a message when the run finished before it cancels", () => {
      createSlowTransform(1);
      H.DataStudio.Transforms.runTab().click();
      getRunButton().click();
      getRunButton().should("have.text", "Running now…");
      getRunStatus().should("have.text", "Run in progress…");

      getCancelButton().click();
      H.modal().button("Yes").click();

      getRunButton().should("have.text", "Canceling…");
      getRunStatus().should("have.text", "Canceling…");

      // We need to pass a timeout here since canceling a transform can
      // take a while on the back end
      getRunButton({ timeout: 40_000 }).should("have.text", "Ran successfully");
      getRunStatus().should(
        "contain",
        "Last ran a few seconds ago successfully.",
      );
      H.DataStudio.Runs.content().should(
        "contain",
        "This run succeeded before it had a chance to cancel.",
      );
    });

    it("should be possible to cancel a SQL transform from the preview (metabase#64474)", () => {
      createSlowTransform(500);

      H.DataStudio.Transforms.clickEditDefinition();
      cy.url().should("include", "/edit");

      getQueryEditor().within(() => {
        cy.findAllByTestId("run-button").eq(0).click();
        cy.findByTestId("loading-indicator").should("be.visible");

        cy.findAllByTestId("run-button").eq(0).click();
        cy.findByTestId("loading-indicator").should("not.exist");
      });
    });
  });

  describe("dependencies", () => {
    it("should render the dependency graph", () => {
      createMbqlTransform({
        name: "Transform A",
        targetTable: "table_a",
        visitTransform: true,
      }).then(() => {
        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
      });

      createMbqlTransform({
        name: "Transform B",
        sourceTable: "table_a",
        targetTable: "table_b",
        visitTransform: true,
      }).then(() => {
        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
      });

      createMbqlTransform({
        name: "Transform C",
        sourceTable: "table_b",
        targetTable: "table_c",
        visitTransform: true,
      });

      H.DataStudio.Transforms.dependenciesTab().click();
      H.DataStudio.Dependencies.content()
        .should("contain", "Transform B")
        .and("contain", "Transform A");
    });

    it("should show if the transform has no dependencies", () => {
      createMbqlTransform({ name: "Transform A", visitTransform: true });
      H.DataStudio.Transforms.dependenciesTab().click();
      H.DataStudio.Dependencies.content().should(
        "contain",
        "Nothing uses this",
      );
    });
  });

  describe("python > common library", () => {
    it(
      "should be possible to edit and save the common library",
      { tags: ["@python"] },
      () => {
        visitCommonLibrary();

        cy.log("updating the library should be possible");
        H.PythonEditor.clear().type(
          dedent`
          def useful_calculation(a, b):
          return a + b
        `,
        );
        getLibraryEditorHeader().findByText("Save").click();

        cy.log("the contents should be saved properly");
        visitCommonLibrary();
        H.PythonEditor.value().should(
          "eq",
          dedent`
          def useful_calculation(a, b):
              return a + b
          `,
        );

        cy.log("reverting the changes should be possible");
        H.PythonEditor.clear().type("# oops");
        getLibraryEditorHeader().findByText("Revert").click();
        H.PythonEditor.value().should(
          "eq",
          dedent`
          def useful_calculation(a, b):
              return a + b
          `,
        );
      },
    );

    it(
      "should be possible to use the common library",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();
        createPythonLibrary(
          "common.py",
          dedent`
            def useful_calculation(a, b):
              return a + b
          `,
        );

        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("Python script").click();

        cy.log("import common should be included by default");
        H.PythonEditor.value().should("contain", "import common");

        H.PythonEditor.clear().type(
          dedent`
            import common
            import pandas as pd

            def transform():
                return pd.DataFrame([{"foo": common.useful_calculation(1, 2)}])
          `,
          { allowFastSet: true },
        );

        cy.findByTestId("python-data-picker")
          .findByText("Select a table…")
          .click();

        H.entityPickerModal().within(() => {
          cy.findByText("Schema A").click();
          cy.findByText("Animals").click();
        });

        getQueryEditor().button("Save").click();

        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type("Python transform");
          cy.findByLabelText("Table name").clear().type("python_transform");
          cy.button("Save").click();
        });

        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
        H.DataStudio.Transforms.settingsTab().click();
        getTableLink().click();
        H.queryBuilderHeader()
          .findByText("Python Transform")
          .should("be.visible");
        H.assertQueryBuilderRowCount(1);
        cy.findByTestId("scalar-value").should("have.text", "3");
        H.expectUnstructuredSnowplowEvent({
          event: "transform_created",
        });

        cy.log("update the common library and run the transform again");
        cy.go("back");
        createPythonLibrary(
          "common.py",
          dedent`
            def useful_calculation(a, b):
              return a + b + 40
          `,
        );
        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
        H.DataStudio.Transforms.settingsTab().click();
        getTableLink().click();
        H.queryBuilderHeader()
          .findByText("Python Transform")
          .should("be.visible");
        H.assertQueryBuilderRowCount(1);
        cy.findByTestId("scalar-value").should("have.text", "43");
      },
    );

    it(
      "should navigate to the common library when clicking 'common' in an import statement",
      { tags: ["@python"] },
      () => {
        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("Python script").click();
        cy.get(".cm-clickable-token").should("be.visible").click();
        H.modal().button("Discard changes").click();
        cy.url().should("include", "/data-studio/transforms/library/common.py");
        cy.findByTestId("python-library-header").should("be.visible");
      },
    );

    it(
      "should open the common library in a new tab when cmd-clicking 'common' in an import statement",
      { tags: ["@python"] },
      () => {
        visitTransformListPage();
        cy.window().then((win) => {
          cy.stub(win, "open").as("windowOpen");
        });
        cy.button("Create a transform").click();
        H.popover().findByText("Python script").click();
        cy.get(".cm-clickable-token")
          .should("be.visible")
          .click({ metaKey: true });

        cy.get("@windowOpen").should(
          "have.been.calledWithMatch",
          "/data-studio/transforms/library/common.py",
        );
      },
    );

    it(
      "should be able to run a transform with default import common even without custom library code",
      { tags: ["@python"] },
      () => {
        H.setPythonRunnerSettings();

        visitTransformListPage();
        cy.button("Create a transform").click();
        H.popover().findByText("Python script").click();

        cy.log("import common should be included by default");
        H.PythonEditor.value().should("contain", "import common");

        cy.log(
          "write a transform that imports common but does not use it - should still run",
        );
        H.PythonEditor.clear().type(
          dedent`
            import common
            import pandas as pd

            def transform():
                return pd.DataFrame([{"result": 42}])
          `,
          { allowFastSet: true },
        );

        cy.findByTestId("python-data-picker")
          .findByText("Select a table…")
          .click();

        H.entityPickerModal().within(() => {
          cy.findByText("Schema A").click();
          cy.findByText("Animals").click();
        });

        getQueryEditor().button("Save").click();

        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type("Default common transform");
          cy.findByLabelText("Table name").clear().type("default_common");
          cy.button("Save").click();
        });

        H.DataStudio.Transforms.runTab().click();
        runTransformAndWaitForSuccess();
        H.DataStudio.Transforms.settingsTab().click();
        getTableLink().click();
        H.queryBuilderHeader()
          .findByText("Default Common")
          .should("be.visible");
        H.assertQueryBuilderRowCount(1);
        cy.findByTestId("scalar-value").should("have.text", "42");
      },
    );

    function visitCommonLibrary(path = "common.py") {
      cy.visit(`/data-studio/transforms/library/${path}`);
    }

    function getLibraryEditorHeader() {
      return cy.findByTestId("python-library-header");
    }
  });

  describe("collections", () => {
    it("should create collections and save transforms to them", () => {
      cy.log("create a collection from the transforms list");
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Transform folder").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").type("Marketing Transforms");
        cy.button("Create").click();
      });

      getTransformsList().within(() => {
        cy.findByText("Marketing Transforms").should("be.visible");
      });

      cy.log("create a nested collection");
      cy.button("Create a transform").click();
      H.popover().findByText("Transform folder").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").type("Q4 Reports");
        cy.findByTestId("collection-picker-button").click();
      });

      cy.findByRole("dialog", { name: "Select a collection" }).within(() => {
        cy.findByText("Marketing Transforms").click();
        cy.findByRole("button", { name: "Select" }).click();
      });

      H.modal().findByRole("button", { name: "Create" }).click();

      getTransformsList().within(() => {
        // Expand the collection to see the nested collection
        cy.findByText("Marketing Transforms").click();
        cy.findByText("Q4 Reports").should("be.visible");
      });

      cy.log("create a transform and save it to a collection");
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });

      getQueryEditor().button("Save").click();

      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("Sales Summary");
        cy.findByLabelText("Table name").clear().type("sales_summary");
        cy.findByTestId("collection-picker-button").click();
      });

      cy.findByRole("dialog", { name: "Select a collection" }).within(() => {
        cy.findByText("Marketing Transforms").click();
        cy.findByRole("button", { name: "Select" }).click();
      });

      H.modal().findByRole("button", { name: "Save" }).click();
      cy.wait("@createTransform");

      cy.log("verify breadcrumbs show the collection path");
      cy.findByTestId("data-studio-breadcrumbs").within(() => {
        cy.findByText("Marketing Transforms").should("be.visible");
        cy.findByText("Sales Summary").should("be.visible");
      });

      cy.log("navigate back to list via breadcrumb");
      cy.findByTestId("data-studio-breadcrumbs").within(() => {
        cy.findByRole("link", { name: "Marketing Transforms" }).click();
      });

      cy.url().should("include", "collectionId=");
      getTransformsList().within(() => {
        cy.findByText("Sales Summary").should("be.visible");
        cy.findByText("Q4 Reports").should("be.visible");
      });
    });

    it("should move transforms between collections", () => {
      H.createTransformCollection({ name: "Target Collection" });

      createMbqlTransform({
        name: "Movable Transform",
        targetTable: "movable_transform",
        visitTransform: true,
      });

      cy.log("move transform to collection");
      H.DataStudio.Transforms.header().icon("ellipsis").click();
      H.popover().findByText("Move").click();

      H.modal().within(() => {
        cy.findByText("Target Collection").click();
        cy.findByRole("button", { name: "Select" }).click();
      });

      H.undoToast().findByText("Transform moved").should("be.visible");

      cy.log("verify breadcrumbs show collection path");
      cy.findByTestId("data-studio-breadcrumbs").within(() => {
        cy.findByText("Target Collection").should("be.visible");
        cy.findByText("Movable Transform").should("be.visible");
      });

      cy.log("move transform back to root");
      H.DataStudio.Transforms.header().icon("ellipsis").click();
      H.popover().findByText("Move").click();

      H.modal().within(() => {
        cy.findByText("Transforms").click();
        cy.findByRole("button", { name: "Select" }).click();
      });

      H.undoToastList().findByText("Transform moved").should("be.visible");

      cy.log("verify breadcrumbs no longer show collection");
      cy.findByTestId("data-studio-breadcrumbs").within(() => {
        cy.findByText("Target Collection").should("not.exist");
        cy.findByText("Movable Transform").should("be.visible");
      });
    });

    it("should support search in the transforms list", () => {
      H.createTransformCollection({ name: "Analytics" }).then((collection) => {
        createMbqlTransform({
          name: "Alpha Transform",
          targetTable: "alpha_output",
        });

        createMbqlTransform({
          name: "Beta Transform",
          targetTable: "beta_output",
          collectionId: collection.body.id,
        });
      });

      visitTransformListPage();

      cy.log("search should find transforms by name");
      cy.findByPlaceholderText("Search...").type("alpha");

      getTransformsList().within(() => {
        cy.findAllByRole("row").should("have.length", 1);
        cy.findByText("Alpha Transform").should("be.visible");
        cy.findByText("Beta Transform").should("not.exist");
      });

      cy.log("search should find transforms by output table name");
      cy.findByPlaceholderText("Search...").clear().type("beta_output");

      getTransformsList().within(() => {
        cy.findByText("Beta Transform").should("be.visible");
        cy.findByText("Alpha Transform").should("not.exist");
        cy.findByText("Analytics").should("be.visible");
      });

      cy.findByPlaceholderText("Search...").clear();
    });

    it("should create a new collection from the collection picker while saving a transform", () => {
      visitTransformListPage();
      cy.button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.miniPicker().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });

      getQueryEditor().button("Save").click();

      cy.log("open collection picker and create new collection inline");
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type("Analytics Transform");
        cy.findByLabelText("Table name").clear().type("analytics_transform");
        cy.findByTestId("collection-picker-button").click();
      });

      cy.findByRole("dialog", { name: "Select a collection" }).within(() => {
        cy.findByRole("button", { name: /New folder/ }).click();
      });

      cy.findByRole("dialog", { name: "Create a new collection" }).within(
        () => {
          cy.findByLabelText("Give it a name").type("Analytics");
          cy.button("Create").click();
        },
      );

      cy.findByRole("dialog", { name: "Select a collection" }).within(() => {
        cy.findByText("Analytics").should("be.visible");
        cy.findByRole("button", { name: "Select" }).click();
      });

      H.modal().findByRole("button", { name: "Save" }).click();
      cy.wait("@createTransform");

      cy.log("verify transform is in the new collection");
      cy.findByTestId("data-studio-breadcrumbs").within(() => {
        cy.findByText("Analytics").should("be.visible");
        cy.findByText("Analytics Transform").should("be.visible");
      });

      getTransformsNavLink().click();
      getTransformsList().within(() => {
        cy.findByText("Analytics").should("be.visible");
        cy.findByText("Analytics").click();
        cy.findByText("Analytics Transform").should("be.visible");
      });
    });

    it("should sort transforms by all columns", () => {
      H.createTransformCollection({ name: "Reports" }).then((collection) => {
        createMbqlTransform({
          name: "Zebra Transform",
          targetTable: "zebra_output",
        });

        createMbqlTransform({
          name: "Alpha Transform",
          targetTable: "alpha_output",
          collectionId: collection.body.id,
        });

        createMbqlTransform({
          name: "Middle Transform",
          targetTable: "middle_output",
        });
      });

      visitTransformListPage();

      cy.log("expand Reports collection to see all transforms");
      getTransformsList().findByText("Reports").click();

      cy.log("verify sorting by name column ascending");
      getTransformsList().findByText("Name").click();

      getRowNames().should("deep.equal", [
        "Middle Transform",
        "Python library",
        "Reports",
        "Alpha Transform",
        "Zebra Transform",
      ]);

      cy.log("verify sorting by name column descending");
      getTransformsList().findByText("Name").click();
      getRowNames().should("deep.equal", [
        "Zebra Transform",
        "Reports",
        "Alpha Transform",
        "Python library",
        "Middle Transform",
      ]);

      cy.log("verify sorting by output table column ascending");
      getTransformsList().findByText("Output table").click();
      getRowNames().should("deep.equal", [
        "Reports",
        "Alpha Transform",
        "Python library",
        "Middle Transform",
        "Zebra Transform",
      ]);

      cy.log("verify sorting by output table column descending");
      getTransformsList().findByText("Output table").click();
      getRowNames().should("deep.equal", [
        "Zebra Transform",
        "Middle Transform",
        "Reports",
        "Alpha Transform",
        "Python library",
      ]);
    });

    it("should edit collection details", () => {
      H.createTransformCollection({ name: "Original Name" });
      H.createTransformCollection({ name: "Target Parent" });

      visitTransformListPage();

      cy.log("open edit modal via collection menu");
      getTransformsList()
        .findByText("Original Name")
        .closest('[role="row"]')
        .findByRole("button", { name: "Collection menu" })
        .click();

      H.popover().findByText("Edit collection details").click();

      cy.log("edit name and description");
      H.modal().within(() => {
        cy.findByText("Editing Original Name").should("be.visible");
        cy.findByLabelText("Name").clear().type("Renamed Collection");
        cy.findByLabelText("Description").type("A helpful description");
        cy.findByTestId("collection-picker-button").click();
      });

      cy.log("change parent collection");
      cy.findByRole("dialog", { name: "Select a collection" }).within(() => {
        cy.findByText("Target Parent").click();
        cy.findByRole("button", { name: "Select" }).click();
      });

      H.modal().button("Save").click();

      cy.log("verify collection was renamed and moved");
      getTransformsList().within(() => {
        cy.findByText("Original Name").should("not.exist");
        cy.findByText("Target Parent").click();
        cy.findByText("Renamed Collection").should("be.visible");
      });
    });

    it("should archive a collection with transforms", () => {
      H.createTransformCollection({ name: "Archive Me" }).then((collection) => {
        createMbqlTransform({
          name: "Transform In Collection",
          targetTable: "archived_transform_table",
          collectionId: collection.body.id,
        });
      });

      visitTransformListPage();

      getTransformsList().within(() => {
        cy.findByText("Archive Me").should("be.visible");
        cy.findByText("Archive Me").click();
        cy.findByText("Transform In Collection").should("be.visible");
      });

      cy.log("archive the collection via menu");
      getTransformsList()
        .findByText("Archive Me")
        .closest('[role="row"]')
        .findByRole("button", { name: "Collection menu" })
        .click();

      H.popover().findByText("Archive").click();

      H.modal().within(() => {
        cy.findByText('Archive "Archive Me"?').should("be.visible");
        cy.findByText("This will also archive 1 transform inside it.").should(
          "be.visible",
        );
        cy.button("Archive").click();
      });

      H.undoToast().findByText("Collection archived").should("be.visible");

      cy.log("verify collection and its children are no longer visible");
      getTransformsList().within(() => {
        cy.findByText("Archive Me").should("not.exist");
        cy.findByText("Transform In Collection").should("not.exist");
      });
    });

    it("should show Python library item and navigate to it", () => {
      // Python library row only appears when we have at least one transform
      H.createSqlTransform({
        sourceQuery: "SELECT 1",
        targetTable: "table_a",
        targetSchema: "Schema A",
      });
      visitTransformListPage();

      cy.log("Python library should be visible in the list");
      getTransformsList().within(() => {
        cy.findByText("Python library").should("be.visible");
      });

      cy.log("clicking Python library should navigate to the library editor");
      getTransformsList().findByText("Python library").click();

      cy.url().should("include", "/data-studio/transforms/library/common.py");
      cy.findByTestId("python-library-header").should("be.visible");
    });
  });

  describe("revision history", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/revision/revert").as("revert");
      cy.intercept("GET", "/api/revision*").as("revisionHistory");
    });

    it("should be able to view and revert transform revisions", () => {
      cy.log("Create a transform with initial name");
      createMbqlTransform({
        name: "Revision Test Transform",
        visitTransform: true,
      });

      cy.log("Make changes to create a revision");
      H.DataStudio.Transforms.header()
        .findByPlaceholderText("Name")
        .clear()
        .type("Updated Transform Name")
        .blur();
      cy.wait("@updateTransform");

      cy.log("Make another change");
      H.DataStudio.Transforms.header()
        .findByPlaceholderText("Name")
        .clear()
        .type("Another Updated Name")
        .blur();
      cy.wait("@updateTransform");

      cy.log("Open revision history");
      H.DataStudio.Transforms.header().icon("ellipsis").click();
      H.popover().findByText("History").click();

      cy.wait("@revisionHistory");

      cy.log("Verify revision history sidebar is open");
      cy.findByTestId("transform-history-list").should("be.visible");

      cy.log("Verify revision entries are displayed");
      cy.findByTestId("transform-history-list")
        .findByText(/created this/)
        .should("be.visible");

      cy.log("Revert to an earlier revision");
      cy.intercept("GET", "/api/transform/*").as("transformReload");
      cy.findByTestId("transform-history-list")
        .findByText(/created this/)
        .parent()
        .within(() => {
          cy.findByTestId("question-revert-button").click();
        });
      cy.wait(["@revert", "@transformReload"]);

      cy.log("Verify transform was reverted");
      H.DataStudio.Transforms.header()
        .findByPlaceholderText("Name")
        .should("have.value", "Revision Test Transform");

      cy.log("Verify revert entry appears in history");
      cy.findByTestId("transform-history-list")
        .findByText(/reverted to an earlier version/)
        .should("be.visible");
    });
  });

  describe("read-only remote sync", () => {
    beforeEach(() => {
      cy.log("create a transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
      });
      cy.log("set up remote sync");
      H.setupGitSync();
      H.configureGit("read-only");
    });

    it("should make the transform list page read-only", () => {
      cy.log("visit transforms page");
      visitTransformListPage();

      cy.log("'Create a transform' menu button is not displayed");
      cy.button("Create a transform").should("not.exist");

      cy.log("clicking Python library navigates to the library editor");
      getTransformsList().findByText("Python library").click();

      cy.log("python library editor is read-only");
      cy.url().should("include", "/data-studio/transforms/library/common.py");
      cy.findByRole("alert")
        .contains(/The Python library is not editable/)
        .should("be.visible");

      H.DataStudio.PythonLibrary.editor().within(() => {
        cy.findByRole("textbox").should(
          "have.attr",
          "contenteditable",
          "false",
        );
        cy.findByRole("textbox").should("have.attr", "aria-readonly", "true");
      });
    });

    it("should not allow editing a transform", () => {
      cy.log("visit transform");
      cy.visit("/data-studio/transforms/1");

      cy.log("'edit definition' button is not displayed");
      H.DataStudio.Transforms.editDefinitionButton().should("not.exist");

      cy.log("visit the Run tab");
      H.DataStudio.Transforms.runTab().click();

      cy.log("schedule tags are not editable");
      cy.findByLabelText("Tags").should("be.visible");
      cy.findByLabelText("Tags").should("be.disabled");

      cy.log("visit the Settings tab");
      H.DataStudio.Transforms.settingsTab().click();

      cy.log("'Change target' button is not displayed");
      cy.findByRole("button", { name: /Change target/ }).should("not.exist");

      cy.log("'Only process new and changed data' switch is not displayed");
      cy.findByRole("switch", {
        name: /Only process new and changed data/,
      }).should("be.disabled");

      cy.log("visiting edit mode url directly redirects to view-only mode");
      cy.visit("/data-studio/transforms/1/edit");
      cy.url().should("not.include", "/edit");

      H.DataStudio.Transforms.header()
        .findByRole("img", { name: "ellipsis icon" })
        .click();

      cy.log("ellipsis menu does not have move or delete options");
      cy.findByRole("menu").within(() => {
        cy.findByRole("menuitem", { name: /History/ }).should("be.visible");
        cy.findByRole("menuitem", { name: /Move/ }).should("not.exist");
        cy.findByRole("menuitem", { name: /Delete/ }).should("not.exist");
      });
    });
  });
});

describe("scenarios > admin > transforms > databases without :schemas", () => {
  const DB_NAME = "QA MySQL8";

  beforeEach(() => {
    H.restore("mysql-8");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/transform").as("createTransform");
    cy.intercept("PUT", "/api/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/transform/*/table").as("deleteTransformTable");
    cy.intercept("POST", "/api/transform-tag").as("createTag");
    cy.intercept("PUT", "/api/transform-tag/*").as("updateTag");
    cy.intercept("DELETE", "/api/transform-tag/*").as("deleteTag");
  });

  it("should be not be possible to create a new schema when updating a transform target", () => {
    createMbqlTransform({
      databaseId: WRITABLE_DB_ID,
      sourceTable: "ORDERS",
      visitTransform: true,
      targetSchema: null,
    });

    H.DataStudio.Transforms.settingsTab().click();
    getTransformsTargetContent().button("Change target").click();

    H.modal().findByLabelText("Schema").should("not.exist");
  });

  it("should be not be possible to create a new schema when the database does not support schemas", () => {
    cy.log("create a new transform");
    visitTransformListPage();
    getTransformsList().button("Create a transform").click();
    H.popover().findByText("Query builder").click();

    H.miniPicker().within(() => {
      cy.findByText(DB_NAME).click();
      cy.findByText("Orders").click();
    });
    getQueryEditor().button("Save").click();
    H.modal().findByLabelText("Schema").should("not.exist");
  });
});

describe("scenarios > admin > transforms > jobs", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("POST", "/api/transform-job").as("createJob");
    cy.intercept("PUT", "/api/transform-job/*").as("updateJob");
    cy.intercept("DELETE", "/api/transform-job/*").as("deleteJob");
  });

  describe("creation", () => {
    it("should be able to create a job with default properties", () => {
      visitJobListPage();
      H.DataStudio.Jobs.list().findByRole("link", { name: /New/ }).click();

      H.DataStudio.Jobs.editor().button("Save").click();
      cy.wait("@createJob");
      H.undoToast().findByText("New job created").should("be.visible");

      H.DataStudio.Jobs.editor().within(() => {
        cy.findByPlaceholderText("Name").should("have.value", "New job");
        getScheduleFrequencyInput().should("have.value", "daily");
        getScheduleTimeInput().should("have.value", "12:00");
      });
    });

    it("should be able to create a job with custom property values", () => {
      visitJobListPage();
      H.DataStudio.Jobs.list().findByRole("link", { name: /New/ }).click();

      H.DataStudio.Jobs.editor().within(() => {
        cy.findByPlaceholderText("Name").clear().type("Job");
        getScheduleFrequencyInput().click();
      });
      H.popover().findByText("custom").click();
      H.DataStudio.Jobs.editor().within(() => {
        getCronInput().clear().type("0 * * * ?");
        getTagsInput().click();
      });
      H.popover().findByText("daily").click();
      H.DataStudio.Jobs.editor().button("Save").click();
      cy.wait("@createJob");
      H.undoToast().findByText("New job created").should("be.visible");

      H.DataStudio.Jobs.editor().within(() => {
        cy.findByPlaceholderText("Name").should("have.value", "Job");
        getCronInput().should("have.value", "0 * * * ?");
        cy.findByText(/This job will run every hour/).should("be.visible");
        cy.findByText("daily").should("be.visible");
      });
    });
  });

  describe("name", () => {
    it("should be able to edit the name after creation", () => {
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });

      H.DataStudio.Jobs.editor()
        .findByPlaceholderText("Name")
        .clear()
        .type("New name")
        .blur();
      H.undoToast().findByText("Job name updated").should("be.visible");
      H.DataStudio.Jobs.editor()
        .findByPlaceholderText("Name")
        .should("have.value", "New name");
    });
  });

  describe("schedule", () => {
    it("should be able to run a job on a schedule", () => {
      H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
        createMbqlTransform({
          tagIds: [tag.id],
        });
        H.createTransformJob({
          name: "New job",
          schedule: "* * * * * ? *", // every second
          tag_ids: [tag.id],
        });
      });
      H.waitForSucceededTransformRuns();
      visitRunListPage();
      getTransformRunTable().within(() => {
        cy.findAllByText("MBQL transform").should("have.length.gte", 1);
        cy.findAllByText("Success").should("have.length.gte", 1);
        cy.findAllByText("Schedule").should("have.length.gte", 1);
      });
    });

    it("should be able to change the schedule after creation", () => {
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });
      H.DataStudio.Jobs.editor().within(() => {
        getScheduleFrequencyInput().click();
      });
      H.popover().findByText("weekly").click();
      H.undoToast().findByText("Job schedule updated").should("be.visible");
      H.DataStudio.Jobs.editor().within(() => {
        getScheduleFrequencyInput().should("have.value", "weekly");
      });
    });

    it("should recognize built-in jobs in the cron builder", () => {
      visitJobListPage();

      const jobNameToFrequency = {
        "Hourly job": "hourly",
        "Daily job": "daily",
        "Weekly job": "weekly",
        "Monthly job": "monthly",
      };
      Object.entries(jobNameToFrequency).forEach(([jobName, frequency]) => {
        H.DataStudio.Jobs.list().findByText(jobName).click();
        H.DataStudio.Jobs.editor().within(() => {
          getScheduleFrequencyInput().should("have.value", frequency);
        });
        cy.go("back");
      });
    });
  });

  describe("tags", () => {
    it("should be able to add and remove tags", () => {
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });
      getTagsInput().click();

      H.popover().findByText("hourly").click();
      cy.wait("@updateJob");
      assertOptionSelected("hourly");
      assertOptionNotSelected("daily");

      H.popover().findByText("daily").click();
      cy.wait("@updateJob");
      assertOptionSelected("hourly");
      assertOptionSelected("daily");

      getTagsInput().type("{backspace}");
      assertOptionSelected("hourly");
      assertOptionNotSelected("daily");
    });
  });

  describe("runs", () => {
    beforeEach(() => {
      H.resetSnowplow();
    });

    it("should be able to manually run a job", () => {
      H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
        createMbqlTransform({
          tagIds: [tag.id],
        });
        H.createTransformJob(
          { name: "New job", tag_ids: [tag.id] },
          { visitTransformJob: true },
        );
      });
      runJobAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_job_trigger_manual_run",
      });

      H.DataStudio.Jobs.editor()
        .findByText("Last ran a few seconds ago successfully.")
        .should("be.visible");

      getRunsNavLink().click();
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("Success").should("be.visible");
        cy.findByText("Manual").should("be.visible");
      });
    });

    it("should display the error message from a failed run", () => {
      H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
        createSqlTransform({
          sourceQuery: "SELECT * FROM abc",
          tagIds: [tag.id],
        });
        H.createTransformJob(
          { name: "New job", tag_ids: [tag.id] },
          { visitTransformJob: true },
        );
      });
      runJobAndWaitForFailure();
      H.DataStudio.Jobs.editor().findByText(
        "Last run failed a few seconds ago.",
      );
      getRunErrorInfoButton().click();
      H.modal().should("contain.text", 'relation "abc" does not exist');
    });
  });

  describe("deletion", () => {
    it("should be able to delete a job", () => {
      cy.log("create a job with a tag");
      H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
        H.createTransformJob(
          { name: "New job", tag_ids: [tag.id] },
          { visitTransformJob: true },
        );
      });

      cy.log("delete the job");
      H.DataStudio.Jobs.header().icon("ellipsis").click();
      H.popover().findByText("Delete").click();
      H.modal().within(() => {
        cy.button("Delete job").click();
        cy.wait("@deleteJob");
      });
      H.DataStudio.Jobs.list().should("be.visible");
      H.DataStudio.Jobs.list().findByText("New job").should("not.exist");
    });
  });

  describe("default jobs and tags", () => {
    it("should pre-create default jobs and tags", () => {
      const jobNames = ["Hourly job", "Daily job", "Weekly job", "Monthly job"];
      const tagNames = ["hourly", "daily", "weekly", "monthly"];

      cy.log("make sure that default jobs are created");
      visitJobListPage();
      H.DataStudio.Jobs.list().within(() => {
        jobNames.forEach((jobName) =>
          cy.findByText(jobName).should("be.visible"),
        );
      });

      cy.log("make sure that default tags are available for selection");
      H.DataStudio.Jobs.list().findByRole("link", { name: /New/ }).click();
      getTagsInput().click();
      H.popover().within(() => {
        tagNames.forEach((tagName) =>
          cy.findByText(tagName).should("be.visible"),
        );
      });
    });
  });

  describe("dependencies", () => {
    it("should render the transforms table", () => {
      H.createTransformTag({ name: "tag1" }).then(({ body: tag }) => {
        createMbqlTransform({
          targetTable: TARGET_TABLE,
          tagIds: [tag.id],
        });
        H.createTransformJob(
          {
            tag_ids: [tag.id],
          },
          { visitTransformJob: true },
        );
      });

      H.DataStudio.Jobs.editor()
        .findByText("Transforms")
        .scrollIntoView()
        .should("be.visible");
      getJobTransformTable().within(() => {
        // Check the existence and also their order
        cy.findByText("MBQL transform").should("be.visible");
      });
    });

    it("should not render the transforms table if the job has no transforms", () => {
      H.createTransformJob({}, { visitTransformJob: true });
      H.DataStudio.Jobs.editor()
        .findByText(/There are no transforms for this job/)
        .scrollIntoView()
        .should("be.visible");
      getJobTransformTable().should("not.exist");
    });
  });
});

describe("scenarios > admin > transforms > runs", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should be able to filter runs", () => {
    function createInitialData() {
      H.createTransformTag({ name: "tag1" }).then(({ body: tag1 }) => {
        H.createTransformTag({ name: "tag2" }).then(({ body: tag2 }) => {
          createMbqlTransform({
            targetTable: TARGET_TABLE,
            tagIds: [tag1.id],
            visitTransform: true,
          });
          H.DataStudio.Transforms.runTab().click();
          runTransformAndWaitForSuccess();
          createSqlTransform({
            sourceQuery: "SELECT * FROM abc",
            targetTable: TARGET_TABLE_2,
            tagIds: [tag2.id],
            visitTransform: true,
          });
          H.DataStudio.Transforms.runTab().click();
          runTransformAndWaitForFailure();
        });
      });
    }

    function testTransformFilter() {
      cy.log("no filters");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - add a filter");
      getTransformFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("MBQL transform").click();
        cy.button("Add filter").click();
      });
      getTransformFilterWidget()
        .findByText("MBQL transform")
        .should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("not.exist");
      });

      cy.log("transform filter - update a filter");
      getTransformFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("MBQL transform").click();
        cy.findByText("SQL transform").click();
        cy.button("Update filter").click();
      });
      getTransformFilterWidget()
        .findByText("SQL transform")
        .should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - multiple options");
      getTransformFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("MBQL transform").click();
        cy.button("Update filter").click();
      });
      getTransformFilterWidget()
        .findByText("2 transforms")
        .should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - remove filter");
      getTransformFilterWidget().button("Remove filter").click();
      getTransformFilterWidget().findByText("2 transforms").should("not.exist");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testStatusFilter() {
      cy.log("no filters");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("status filter - add a filter");
      getStatusFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Success").click();
        cy.button("Add filter").click();
      });
      getStatusFilterWidget().findByText("Success").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("not.exist");
      });

      cy.log("status filter - update a filter");
      getStatusFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Success").click();
        cy.findByText("Failed").click();
        cy.button("Update filter").click();
      });
      getStatusFilterWidget().findByText("Failed").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("status filter - multiple options");
      getStatusFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Success").click();
        cy.button("Update filter").click();
      });
      getStatusFilterWidget().findByText("2 statuses").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - remove filter");
      getStatusFilterWidget().button("Remove filter").click();
      getStatusFilterWidget().findByText("2 statuses").should("not.exist");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testTagFilter() {
      cy.log("no filters");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("tag filter - add a filter");
      getTagFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("tag1").click();
        cy.button("Add filter").click();
      });
      getTagFilterWidget().findByText("tag1").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("not.exist");
      });

      cy.log("tag filter - update a filter");
      getTagFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("tag1").click();
        cy.findByText("tag2").click();
        cy.button("Update filter").click();
      });
      getTagFilterWidget().findByText("tag2").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("not.exist");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("tag filter - multiple options");
      getTagFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("tag1").click();
        cy.button("Update filter").click();
      });
      getTagFilterWidget().findByText("2 tags").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("tag filter - remove filter");
      getTagFilterWidget().button("Remove filter").click();
      getTagFilterWidget().findByText("2 tags").should("not.exist");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testRunMethodFilter() {
      cy.log("no filters");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("run method filter - add a filter");
      getRunMethodFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Manual").click();
        cy.button("Add filter").click();
      });
      getRunMethodFilterWidget().findByText("Manual").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("run method filter - update a filter");
      getRunMethodFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Manual").click();
        cy.findByText("Schedule").click();
        cy.button("Update filter").click();
      });
      getRunMethodFilterWidget().findByText("Schedule").should("be.visible");
      H.main().findByText("No runs found").should("be.visible");

      cy.log("run method filter - multiple options");
      getRunMethodFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Manual").click();
        cy.button("Update filter").click();
      });
      getRunMethodFilterWidget()
        .findByText("Schedule, Manual")
        .should("be.visible");

      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("run method filter - remove filter");
      getRunMethodFilterWidget().button("Remove filter").click();
      getRunMethodFilterWidget()
        .findByText("Schedule, Manual")
        .should("not.exist");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testStartAtFilter() {
      cy.log("no filters");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("today");
      getStartAtFilterWidget().click();
      H.popover().findByText("Today").click();
      getStartAtFilterWidget().findByText("Today").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      getStartAtFilterWidget().button("Remove filter").click();
      getStartAtFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Relative date range…").click();
        cy.findByText("Include today").click();
        cy.button("Apply").click();
      });
      getStartAtFilterWidget()
        .findByText("Previous 30 days or today")
        .should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      getStartAtFilterWidget().button("Remove filter").click();
      getStartAtFilterWidget().click();
      H.popover().findByText("Previous week").click();
      getStartAtFilterWidget().findByText("Previous week").should("be.visible");
      H.main().findByText("No runs found").should("be.visible");

      getStartAtFilterWidget().button("Remove filter").click();
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testEndAtFilter() {
      cy.log("no filters");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("today");
      getEndAtFilterWidget().click();
      H.popover().findByText("Today").click();
      getEndAtFilterWidget().findByText("Today").should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      getEndAtFilterWidget().button("Remove filter").click();
      getEndAtFilterWidget().click();
      H.popover().within(() => {
        cy.findByText("Relative date range…").click();
        cy.findByText("Include today").click();
        cy.button("Apply").click();
      });
      getEndAtFilterWidget()
        .findByText("Previous 30 days or today")
        .should("be.visible");
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      getEndAtFilterWidget().button("Remove filter").click();
      getEndAtFilterWidget().click();
      H.popover().findByText("Previous week").click();
      getEndAtFilterWidget().findByText("Previous week").should("be.visible");
      H.main().findByText("No runs found").should("be.visible");

      getEndAtFilterWidget().button("Remove filter").click();
      getTransformRunTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    createInitialData();
    getRunsNavLink().click();
    testTransformFilter();
    testStatusFilter();
    testTagFilter();
    testRunMethodFilter();
    testStartAtFilter();
    testEndAtFilter();
  });

  it("should be able to sort runs", () => {
    function createInitialData() {
      H.createTransformTag({ name: "Alpha tag" }).then(({ body: tag1 }) => {
        H.createTransformTag({ name: "Beta tag" }).then(({ body: tag2 }) => {
          createMbqlTransform({
            targetTable: TARGET_TABLE,
            tagIds: [tag1.id],
            visitTransform: true,
          });
          H.DataStudio.Transforms.runTab().click();
          runTransformAndWaitForSuccess();
          createSqlTransform({
            sourceQuery: "SELECT * FROM abc",
            targetTable: TARGET_TABLE_2,
            tagIds: [tag2.id],
            visitTransform: true,
          });
          H.DataStudio.Transforms.runTab().click();
          runTransformAndWaitForFailure();
        });
      });
    }

    function testSorting({
      columnName,
      transformNames,
    }: {
      columnName: string;
      transformNames: string[];
    }) {
      cy.log(`sort by ${columnName} ascending`);
      getTransformRunTable().findByText(columnName).click();
      checkSortingOrder(transformNames);

      cy.log(`sort by ${columnName} descending`);
      getTransformRunTable().findByText(columnName).click();
      checkSortingOrder([...transformNames].reverse());
    }

    createInitialData();
    getRunsNavLink().click();

    // ascending: "MBQL transform" < "SQL transform"
    testSorting({
      columnName: "Transform",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: MBQL started earlier
    testSorting({
      columnName: "Started at",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: MBQL ended earlier
    testSorting({
      columnName: "Ended at",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: "Failed" < "Success"
    testSorting({
      columnName: "Status",
      transformNames: ["SQL transform", "MBQL transform"],
    });

    // ascending: both "Manual", stable sort by id — MBQL created first
    testSorting({
      columnName: "Trigger",
      transformNames: ["MBQL transform", "SQL transform"],
    });

    // ascending: "Alpha tag" < "Beta tag"
    testSorting({
      columnName: "Tags",
      transformNames: ["MBQL transform", "SQL transform"],
    });
  });
});

describe(
  "scenarios > admin > transforms > python runner",
  { tags: ["@python"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_schemas" });
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

      H.setPythonRunnerSettings();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should be possible to test run a Python script", () => {
      H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
        (id) => {
          createPythonLibrary(
            "common.py",
            dedent`
              def useful_calculation(a, b):
                return a + b
            `,
          );

          createPythonTransform({
            body: dedent`
          import pandas as pd
          import common


          def transform(foo):
            print("Hello, world!")
            return pd.DataFrame([{"foo": common.useful_calculation(40, 2) }])
        `,
            sourceTables: { foo: id },
            visitTransform: true,
          });
        },
      );

      cy.log("enter edit mode");
      H.DataStudio.Transforms.clickEditDefinition();

      cy.log("running the script should work");
      runPythonScriptAndWaitForSuccess();
      H.assertTableData({
        columns: ["foo"],
        firstRows: [["42"]],
      });

      cy.log("updating the common library should affect the results");
      createPythonLibrary(
        "common.py",
        dedent`
              def useful_calculation(a, b):
                return a + b + 1
            `,
      );

      runPythonScriptAndWaitForSuccess();
      H.assertTableData({
        columns: ["foo"],
        firstRows: [["43"]],
      });
    });

    it("should display preview notice message", () => {
      H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
        (id) => {
          createPythonTransform({
            body: dedent`
              import pandas as pd

              def transform(foo):
                return pd.DataFrame([{"foo": 42}])
            `,
            sourceTables: { foo: id },
            visitTransform: true,
          });
        },
      );

      H.DataStudio.Transforms.clickEditDefinition();

      H.DataStudio.Transforms.pythonResults()
        .findByText("Done")
        .should("not.exist");
      H.DataStudio.Transforms.pythonResults()
        .findByText("Preview based on the first 100 rows from each table.")
        .should("not.exist");

      runPythonScriptAndWaitForSuccess();

      cy.log("Preview disclaimer should appear");
      H.DataStudio.Transforms.pythonResults()
        .findByText("Done")
        .should("be.visible");
      H.DataStudio.Transforms.pythonResults()
        .findByText("Preview based on the first 100 rows from each table.")
        .should("be.visible");
    });
  },
);

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should not pick the only database when it is disabled in SQL editor", () => {
    cy.log("create a new transform");
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("SQL query").click();

    cy.findByTestId("gui-builder-data")
      .findByText("Select a database")
      .should("be.visible");
  });

  it("should not pick the only database when it is disabled in Python editor", () => {
    cy.log("create a new transform");
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("Python script").click();

    cy.findByTestId("python-transform-top-bar")
      .findByText("Select a database")
      .should("be.visible");
  });
});

function getTransformsNavLink() {
  return H.DataStudio.nav().findByRole("link", { name: "Transforms" });
}

function getRunsNavLink() {
  return H.DataStudio.nav().findByRole("link", { name: "Runs" });
}

function getTransformsList() {
  return cy.findByTestId("transforms-list");
}

function getTransformsTargetContent() {
  return cy.findByTestId("transforms-target-content");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}

function getRunButton(options: { timeout?: number } = {}) {
  return cy.findAllByTestId("run-button").eq(0, options);
}

function getCancelButton() {
  return cy.findByTestId("cancel-button");
}

function getRunStatus() {
  return cy.findByTestId("run-status");
}

function getRunListLink() {
  return cy.findByRole("link", { name: "See all runs" });
}

function getRunErrorInfoButton() {
  return cy.findByLabelText("See error");
}

function getTableLink({ isActive = true }: { isActive?: boolean } = {}) {
  return cy
    .findByTestId("table-link")
    .should("have.attr", "aria-disabled", String(!isActive));
}

function getDatabaseLink() {
  return cy.findByTestId("database-link");
}

function getSchemaLink() {
  return cy.findByTestId("schema-link");
}

function getQueryVisualization() {
  return cy.findByTestId("query-visualization-root");
}

function getSchedulePicker() {
  return cy.findByTestId("schedule-picker");
}

function getScheduleFrequencyInput() {
  return getSchedulePicker().findByLabelText("Frequency");
}

function getScheduleTimeInput() {
  return getSchedulePicker().findByLabelText("Time");
}

function getCronInput() {
  return cy.findByPlaceholderText("For example 5 0 * Aug ?");
}

function getTagsInput() {
  return cy.findByPlaceholderText("Add tags");
}

function getTagsInputContainer() {
  return getTagsInput().parent();
}

function getFieldPicker() {
  return cy.findByLabelText("Field to check for new values");
}

function getIncrementalSwitch() {
  return cy.findByTestId("incremental-switch");
}

function isIncrementalSwitchEnabled() {
  return getIncrementalSwitch().findByRole("switch").should("be.checked");
}
function isIncrementalSwitchDisabled() {
  return getIncrementalSwitch().findByRole("switch").should("not.be.checked");
}

function handleQueryComplexityWarningModal(action: "cancel" | "save") {
  cy.log(`Verify complexity warning modal appears and ${action} it`);
  return H.modal().within(() => {
    cy.findByTestId("query-complexity-warning").should("be.visible");
    if (action === "save") {
      cy.button("Save anyway").click();
    } else {
      cy.button("Cancel").click();
    }
  });
}

function getJobTransformTable() {
  return cy.findByLabelText("Job transforms");
}

function getTransformRunTable() {
  return cy.findByLabelText("Transform runs");
}

function getTransformFilterWidget() {
  return cy.findByRole("group", { name: "Transform" });
}

function getStatusFilterWidget() {
  return cy.findByRole("group", { name: "Status" });
}

function getTagFilterWidget() {
  return cy.findByRole("group", { name: "Tags" });
}

function getRunMethodFilterWidget() {
  return cy.findByRole("group", { name: "Trigger" });
}

function getStartAtFilterWidget() {
  return cy.findByRole("group", { name: "Started at" });
}

function getEndAtFilterWidget() {
  return cy.findByRole("group", { name: "Ended at" });
}

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function visitJobListPage() {
  return cy.visit("/data-studio/transforms/jobs");
}

function visitRunListPage() {
  return cy.visit("/data-studio/transforms/runs");
}

function runTransformAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
}

function runTransformAndWaitForFailure() {
  getRunButton().click();
  getRunButton().should("have.text", "Run failed");
}

function runJobAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
}

function runJobAndWaitForFailure() {
  getRunButton().click();
  getRunButton().should("have.text", "Run failed");
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
    collectionId?: CollectionId | null;
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
  sourceCheckpointStrategy?: TransformSourceCheckpointStrategy;
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

function visitTableQuestion({
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
}: { targetTable?: string; targetSchema?: string } = {}) {
  H.createNativeQuestion(
    {
      database: WRITABLE_DB_ID,
      native: {
        query: `SELECT * FROM "${targetSchema}"."${targetTable}"`,
        "template-tags": {},
      },
    },
    { visitQuestion: true },
  );
}

function assertTableDoesNotExistError({
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
}: { targetTable?: string; targetSchema?: string } = {}) {
  getQueryVisualization()
    .contains(`"${targetSchema}.${targetTable}" does not exist`)
    .should("be.visible");
}

function assertOptionSelected(name: string) {
  getTagsInputContainer().findByText(name).should("be.visible");
}

function assertOptionNotSelected(name: string) {
  getTagsInputContainer().findByText(name).should("not.exist");
}

function editorSidebar() {
  return cy.findByTestId("editor-sidebar");
}

function getPythonDataPicker() {
  return cy.findByTestId("python-data-picker");
}

function createPythonLibrary(path: string, source: string) {
  cy.request("PUT", `/api/ee/transforms-python/library/${path}`, {
    source,
  });
}

function runPythonScriptAndWaitForSuccess() {
  getQueryEditor().findByTestId("run-button").click();

  getQueryEditor()
    .findByTestId("loading-indicator", { timeout: 60000 })
    .should("not.exist");

  H.DataStudio.Transforms.pythonResults().should("be.visible");
}

function getRowNames(): Cypress.Chainable<string[]> {
  return getTransformsList()
    .findAllByTestId("tree-node-name")
    .then(($rows) => $rows.get().map((row) => row.textContent.trim()));
}

describe("scenarios > data studio > transforms > permissions", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("POST", "/api/transform").as("createTransform");
  });

  it("should allow non-admin users with data-studio permission to create transforms", () => {
    cy.log("grant data-studio permission to All Users");
    cy.visit("/admin/permissions/application");
    cy.updatePermissionsGraph({
      [USER_GROUPS.DATA_GROUP]: {
        [WRITABLE_DB_ID]: {
          transforms: DataPermissionValue.YES,
          "view-data": DataPermissionValue.UNRESTRICTED,
          "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        },
      },
    });
    H.setUserAsAnalyst(NORMAL_USER_ID);

    cy.log(
      "Ensure that transform permissions are visible when instance is hosted and transform feature is present",
    );

    cy.findByRole("radio", { name: "Data" }).click({ force: true });
    cy.findByRole("menuitem", { name: "All Users" }).click();

    cy.findByRole("columnheader", { name: /Transforms/ })
      .scrollIntoView()
      .should("be.visible");

    cy.log("sign in as normal user and create a transform");
    cy.signInAsNormalUser();
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("Query builder").click();

    H.miniPicker().within(() => {
      cy.findByText(DB_NAME).click();
      cy.findByText(TARGET_SCHEMA).click();
      cy.findByText(SOURCE_TABLE).click();
    });
    getQueryEditor().button("Save").click();
    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("Non-admin transform");
      cy.findByLabelText("Table name").type(TARGET_TABLE);
      cy.button("Save").click();
      cy.wait("@createTransform");
    });

    cy.log("Verify transform was created");
    getTransformsNavLink().click();
    H.DataStudio.Transforms.list()
      .findByText("Non-admin transform")
      .should("be.visible");
  });
});

function checkSortingOrder(transformNames: string[]) {
  getTransformRunTable().within(() => {
    transformNames.forEach((name, index) => {
      cy.findByText(name)
        .parents("[data-index]")
        .should("have.attr", "data-index", index.toString());
    });
  });
}

describe("scenarios > data studio > transforms > permissions > oss", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "should be able to enable transforms in OSS without upsell gem icon",
    { tags: "@OSS" },
    () => {
      cy.log("ensure that transform permissions are not shown");
      cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP_ID}`);

      //Check that a known header is present
      cy.findByRole("columnheader", { name: "Database name" }).should(
        "be.visible",
      );
      //Ensure transform permissions are not displayed
      cy.findByRole("columnheader", { name: /Transforms/ }).should("not.exist");

      cy.log("Visit data studio page");
      cy.visit("/data-studio");
      H.DataStudio.nav().should("be.visible");

      cy.log("Verify Transforms menu item is visible");
      H.DataStudio.nav().findByText("Transforms").should("be.visible");

      cy.log("Verify no upsell gem icon is displayed in Transforms menu item");
      H.DataStudio.nav()
        .findByText("Transforms")
        .closest("a")
        .within(() => {
          cy.findByTestId("upsell-gem").should("not.exist");
        });

      cy.log("Verify transforms page is accessible");
      H.DataStudio.nav().findByText("Transforms").click();

      H.DataStudio.Transforms.enableTransformPage()
        .findByRole("button", { name: "Enable transforms" })
        .click();

      H.DataStudio.Transforms.list().should("be.visible");

      cy.log("Verify can create transforms in OSS");
      cy.button("Create a transform").should("be.visible").click();

      cy.log("Verify Python transforms are not available in OSS");
      H.popover()
        .findByText(/Python/i)
        .should("not.exist");

      cy.log("transform permissions should still not");
      H.goToAdmin();
      H.appBar().findByRole("link", { name: "Permissions" }).click();
      cy.findByRole("menuitem", { name: "All Users" }).click();

      //Check that a known header is present
      cy.findByRole("columnheader", { name: "Database name" }).should(
        "be.visible",
      );
      //Ensure transform permissions are not displayed
      cy.findByRole("columnheader", { name: /Transforms/ }).should("not.exist");
    },
  );
});

describe("scenarios > data studio > transforms > permissions > pro-self-hosted", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should have transforms available in self-hosted pro without upsell gem icon", () => {
    H.activateToken("pro-self-hosted").then(() => {
      cy.log("ensure that transform permissions are not shown");
      cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP_ID}`);

      //Check that a known header is present
      cy.findByRole("columnheader", { name: "Database name" }).should(
        "be.visible",
      );
      //Ensure transform permissions are not displayed
      cy.findByRole("columnheader", { name: /Transforms/ }).should("not.exist");

      cy.log("Visit data studio page");
      cy.visit("/data-studio");
      H.DataStudio.nav().should("be.visible");

      cy.log("Verify Transforms menu item is visible");
      H.DataStudio.nav().findByText("Transforms").should("be.visible");

      cy.log("Verify no upsell gem icon is displayed in Transforms menu item");
      H.DataStudio.nav()
        .findByText("Transforms")
        .closest("a")
        .within(() => {
          cy.findByTestId("upsell-gem").should("not.exist");
        });

      cy.log("Verify transforms page is accessible");
      H.DataStudio.nav().findByText("Transforms").click();
      H.DataStudio.Transforms.enableTransformPage()
        .findByRole("button", { name: "Enable transforms" })
        .click();
      H.DataStudio.Transforms.list().should("be.visible");

      cy.log("Verify can create transforms in pro-self-hosted");
      cy.button("Create a transform").should("be.visible");

      cy.log("transform permissions should now be visible");
      H.goToAdmin();
      H.appBar().findByRole("link", { name: "Permissions" }).click();
      cy.findByRole("menuitem", { name: "All Users" }).click();

      //Check that a known header is present
      cy.findByRole("columnheader", { name: "Database name" }).should(
        "be.visible",
      );
      //Ensure transform permissions are displayed
      cy.findByRole("columnheader", { name: /Transforms/ })
        .scrollIntoView()
        .should("be.visible");
    });
  });
});

describe("scenarios > data studio > transforms > permissions > starter", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should have transforms upsell", () => {
    H.activateToken("starter").then(() => {
      cy.log("Visit data studio page");
      cy.visit("/data-studio");
      H.DataStudio.nav().should("be.visible");

      cy.log("Verify Transforms menu item is visible");
      H.DataStudio.nav().findByText("Transforms").should("be.visible");

      cy.log(
        "Verify there is an upsell gem icon is displayed in Transforms menu item",
      );
      H.DataStudio.nav()
        .findByText("Transforms")
        .closest("a")
        .within(() => {
          cy.findByTestId("upsell-gem").should("be.visible");
        });

      cy.log("Verify transforms page is accessible");
      H.DataStudio.nav().findByText("Transforms").click();

      cy.findByText("Start transforming your data in Metabase").should(
        "be.visible",
      );
    });
  });
});
