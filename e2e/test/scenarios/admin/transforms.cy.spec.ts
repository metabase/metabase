const { H } = cy;

import dedent from "ts-dedent";

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  CardType,
  PythonTransformTableAliases,
  TransformTagId,
} from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_TABLE_2 = "transform_table_2";
const TARGET_SCHEMA = "Schema A";
const TARGET_SCHEMA_2 = "Schema B";
const CUSTOM_SCHEMA = "custom_schema";

H.describeWithSnowplowEE("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/ee/transform").as("createTransform");
    cy.intercept("PUT", "/api/ee/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/ee/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/ee/transform/*/table").as(
      "deleteTransformTable",
    );
    cy.intercept("GET", "/api/ee/transform/*/dependencies").as(
      "transformDependencies",
    );
    cy.intercept("POST", "/api/ee/transform-tag").as("createTag");
    cy.intercept("PUT", "/api/ee/transform-tag/*").as("updateTag");
    cy.intercept("DELETE", "/api/ee/transform-tag/*").as("deleteTag");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("creation", () => {
    it("should be able to create and run an mbql transform", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.expectUnstructuredSnowplowEvent({
        event: "transform_create",
        event_detail: "query",
        triggered_from: "transform-page-create-menu",
      });

      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("MBQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform and make sure its table can be queried");
      runTransformAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
        triggered_from: "transform-page",
      });

      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
      H.expectUnstructuredSnowplowEvent({
        event: "transform_created",
      });
    });

    it("should be able to create and run a SQL transform", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("SQL query").click();

      H.expectUnstructuredSnowplowEvent({
        event: "transform_create",
        event_detail: "native",
        triggered_from: "transform-page-create-menu",
      });

      H.popover().findByText(DB_NAME).click();
      H.NativeEditor.type(`SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`);
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("SQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      H.expectUnstructuredSnowplowEvent({
        event: "transform_created",
      });

      cy.log("run the transform and make sure its table can be queried");
      runTransformAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
        triggered_from: "transform-page",
      });

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
      getTransformListPage().button("Create a transform").click();
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
        setPythonRunnerSettings();
        cy.log("create a new transform");
        visitTransformListPage();
        getTransformListPage().button("Create a transform").click();
        H.popover().findByText("Python script").click();

        H.expectUnstructuredSnowplowEvent({
          event: "transform_create",
          event_detail: "python",
          triggered_from: "transform-page-create-menu",
        });

        cy.findByTestId("python-data-picker")
          .findByText("Select a database")
          .click();

        cy.log("Unsupported databases should be disabled");
        H.popover()
          .findByRole("option", { name: "Sample Database" })
          .should("have.attr", "aria-disabled", "true");

        cy.log("Select database");
        H.popover().findByText(DB_NAME).click();

        getPythonDataPicker().button("Select a table…").click();
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
        runTransformAndWaitForSuccess();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_trigger_manual_run",
          triggered_from: "transform-page",
        });

        getRunSection().should("contain", "Executing Python transform");

        getTableLink().click();
        H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
        H.assertQueryBuilderRowCount(1);
      },
    );

    it("should be able to create and run a transform from a question or a model", () => {
      function testCardSource({
        type,
        label,
      }: {
        type: CardType;
        label: string;
      }) {
        H.resetSnowplow();

        cy.log("create a query in the target database");
        H.getTableId({ name: SOURCE_TABLE, databaseId: WRITABLE_DB_ID }).then(
          (tableId) =>
            H.createQuestion({
              name: "Test",
              type,
              database: WRITABLE_DB_ID,
              query: {
                "source-table": tableId,
              },
            }),
        );

        cy.log("create a new transform");
        visitTransformListPage();
        getTransformListPage().button("Create a transform").click();
        H.popover().findByText("A copy of a saved question").click();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_create",
          event_detail: "saved-question",
          triggered_from: "transform-page-create-menu",
        });

        H.entityPickerModal().within(() => {
          H.entityPickerModalTab(label);
          cy.findByText("Test").click();
        });
        getQueryEditor().button("Save").click();
        H.modal().within(() => {
          cy.findByLabelText("Name").type(`${type} transform`);
          cy.findByLabelText("Table name").type(`${type}_transform`);
          cy.button("Save").click();
          cy.wait("@createTransform");
        });

        H.expectUnstructuredSnowplowEvent({
          event: "transform_created",
        });

        cy.log("run the transform and make sure its table can be queried");
        runTransformAndWaitForSuccess();
        H.expectUnstructuredSnowplowEvent({
          event: "transform_trigger_manual_run",
          triggered_from: "transform-page",
        });

        getTableLink().click();
        H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
        H.assertQueryBuilderRowCount(3);
      }

      testCardSource({ type: "question", label: "Questions" });
      testCardSource({ type: "model", label: "Models" });
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
      getTransformPage().findByText("Edit query").click();

      getQueryEditor().icon("sql").click();
      H.sidebar().should("be.visible");
      H.NativeEditor.value().should("eq", EXPECTED_QUERY);

      H.sidebar().findByText("Convert this transform to SQL").click();
      H.sidebar().should("be.visible");

      H.NativeEditor.value().should("eq", EXPECTED_QUERY);
      getQueryEditor().button("Save changes").click();
      getTransformPage().should("be.visible");

      cy.log("run the transform and make sure its table can be queried");
      runTransformAndWaitForSuccess();
      H.expectUnstructuredSnowplowEvent({
        event: "transform_trigger_manual_run",
        triggered_from: "transform-page",
      });

      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should not allow to overwrite an existing table when creating a transform", () => {
      cy.log("open the new transform page");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      cy.log("set the query");
      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("MBQL transform");
        cy.findByLabelText("Table name").type(SOURCE_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
        cy.findByText("A table with that name already exists.").should(
          "be.visible",
        );
      });
    });

    it("should be able to create a new schema when saving a transform", () => {
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("MBQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.findByLabelText("Schema").clear().type(CUSTOM_SCHEMA);
      });
      H.popover().findByText("Create new schema").click();
      H.modal().within(() => {
        cy.button("Save").click();
        cy.wait("@createTransform");
        cy.wait("@transformDependencies");
      });

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

      getTableLink()
        .should("have.text", TARGET_TABLE)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      runTransformAndWaitForSuccess();
      getSchemaLink()
        .should("have.text", CUSTOM_SCHEMA)
        .should("have.attr", "aria-disabled", "false")
        .realHover();

      getTableLink().click();
      H.queryBuilderHeader().findByText(CUSTOM_SCHEMA).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to create a new table in an existing when saving a transform", () => {
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("MBQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      getSchemaLink()
        .should("have.text", TARGET_SCHEMA)
        .should("have.attr", "aria-disabled", "false");

      getTableLink()
        .should("have.text", TARGET_TABLE)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      runTransformAndWaitForSuccess();

      getSchemaLink().should("have.attr", "aria-disabled", "false");
      getTableLink().should("have.attr", "aria-disabled", "false").click();

      H.assertQueryBuilderRowCount(3);
    });

    it("should not be possible to create an mbql transform from a table from an unsupported database", () => {
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.entityPickerModal().within(() => {
        cy.findAllByTestId("picker-item")
          .contains("Sample Database")
          .should("have.attr", "data-disabled", "true");

        cy.findAllByTestId("picker-item")
          .contains("Orders")
          .should("have.attr", "data-disabled", "true");
      });
    });

    it("should not be possible to create an mbql transform from metrics", () => {
      H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
        (tableId) =>
          H.createQuestion({
            name: "Metric",
            type: "metric",
            query: {
              "source-table": tableId,
              aggregation: [["count"]],
            },
          }),
      );

      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      H.entityPickerModal().within(() => {
        cy.findByText("Collections").click();
        cy.findAllByTestId("picker-item")
          .contains("Metric")
          .should("have.attr", "data-disabled", "true");
      });
    });

    it("should not be possible to create a sql transform from a table from an unsupported database", () => {
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("SQL query").click();

      H.popover()
        .findByRole("option", { name: "Sample Database" })
        .should("have.attr", "aria-disabled", "true")
        .click();

      cy.log("Clicking the disabled item does not close the popover");
      H.popover().should("be.visible");
    });

    it("should not be possible to create a transform from a question or a model that is based of an unsupported database", () => {
      function testCardSource({
        type,
        label,
      }: {
        type: CardType;
        label: string;
      }) {
        cy.log("create a query in the target database");
        H.createQuestion({
          name: "Test",
          type,
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
          },
        });

        cy.log("create a new transform");
        visitTransformListPage();
        getTransformListPage().button("Create a transform").click();
        H.popover().findByText("A copy of a saved question").click();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab(label);
          cy.findAllByTestId("picker-item")
            .contains("Test")
            .should("have.attr", "data-disabled", "true");
        });
      }

      testCardSource({ type: "question", label: "Questions" });
      testCardSource({ type: "model", label: "Models" });
    });

    it("should not auto-pivot query results for MBQL transforms", () => {
      cy.log("create a new transform");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      cy.log("build a query with 1 aggregation and 2 breakouts");
      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
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
  });

  describe("filtering", () => {
    it("should be able to filter transforms", () => {
      createMbqlTransform({ visitTransform: true });
      runJobAndWaitForSuccess();

      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: TARGET_TABLE_2,
        visitTransform: true,
      });
      getTagsInput().click();
      H.popover().findByText("hourly").click();
      H.undoToast().findByText("Transform tags updated").should("be.visible");

      visitTransformListPage();

      function testLastRunDateFilter() {
        cy.log("no filters");
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("be.visible");
        });

        cy.log("last run at - add a filter");
        getLastRunDateFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("Relative date range…").click();
          cy.findByText("Current").click();
          cy.findByText("Week").click();
        });

        getLastRunDateFilterWidget().should("contain", "This week");
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("not.exist");
        });

        cy.log("last run at filter - remove filter");
        getLastRunDateFilterWidget().button("Remove filter").click();
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("be.visible");
        });
      }

      function testLastRunStatusFilter() {
        cy.log("no filters");
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("be.visible");
        });

        cy.log("last run status - add a filter");
        getLastRunStatusFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("Success").click();
          cy.findByText("Add filter").click();
        });

        getLastRunStatusFilterWidget().should("contain", "Success");
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("not.exist");
        });

        cy.log("last run status filter - remove filter");
        getLastRunStatusFilterWidget().button("Remove filter").click();
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("be.visible");
        });
      }

      function testTagFilter() {
        cy.log("no filters");
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("be.visible");
        });

        cy.log("tags - add a filter");
        getTagFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("hourly").click();
          cy.findByText("daily").click();
          cy.button("Add filter").click();
        });

        getTagFilterWidget().should("contain", "2 tags");
        getContentTable().within(() => {
          cy.findByText("SQL transform").should("be.visible");
          cy.findByText("MBQL transform").should("not.exist");
        });

        cy.log("last run status filter - remove filter");
        getTagFilterWidget().button("Remove filter").click();
        getContentTable().within(() => {
          cy.findByText("MBQL transform").should("be.visible");
          cy.findByText("SQL transform").should("be.visible");
        });
      }

      testLastRunDateFilter();
      testLastRunStatusFilter();
      testTagFilter();
    });
  });

  describe("name and description", () => {
    it("should be able to edit the name and description after creation", () => {
      createMbqlTransform({ visitTransform: true });

      getTransformPage()
        .findByPlaceholderText("Name")
        .clear()
        .type("New name")
        .blur();
      H.undoToast().findByText("Transform name updated").should("be.visible");
      getTransformPage()
        .findByPlaceholderText("Name")
        .should("have.value", "New name");

      getTransformPage()
        .findByPlaceholderText("No description yet")
        .clear()
        .type("New description")
        .blur();
      H.undoToastList()
        .should("have.length", 2)
        .last()
        .findByText("Transform description updated")
        .should("be.visible");
      getTransformPage()
        .findByPlaceholderText("No description yet")
        .should("have.value", "New description");
    });
  });

  describe("tags", () => {
    it("should be able to add and remove tags", () => {
      createMbqlTransform({ visitTransform: true });
      getTagsInput().click();

      H.popover().findByText("hourly").click();
      cy.wait("@updateTransform");
      assertOptionSelected("hourly");
      assertOptionNotSelected("daily");

      H.popover().findByText("daily").click();
      cy.wait("@updateTransform");
      assertOptionSelected("hourly");
      assertOptionSelected("daily");

      getTagsInput().type("{backspace}");
      assertOptionSelected("hourly");
      assertOptionNotSelected("daily");
    });

    it("should be able to create tags inline", () => {
      createMbqlTransform({ visitTransform: true });
      getTagsInput().type("New tag");
      H.popover().findByText("New tag").click();
      cy.wait("@createTag");
      H.undoToast().should("contain.text", "Transform tags updated");
    });

    it("should be able to update tags inline", () => {
      createMbqlTransform({ visitTransform: true });

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
      getTagsInput().type("New tag");
      H.popover().findByText("New tag").click();
      cy.wait("@createTag");

      cy.log("Navigate to transform B");
      getNavSidebar().findByText("Transforms").click();
      getTransformListPage().findByText("Transform B").click();

      cy.log("Remove the new tag from transform B");
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
      cy.findByTestId("admin-layout-sidebar").findByText("Transforms").click();
      getTransformListPage().findByText("Transform A").click();

      cy.log("The tag should be gone");
      getTagsInput()
        .parent()
        // Select the tag pill
        .get("[data-with-remove=true]")
        .should("not.exist");
    });
  });

  describe("targets", () => {
    it("should be able to change the target before running a transform", () => {
      cy.log("create but do not run the transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("modify the transform before running");
      getTransformPage().button("Change target").click();
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

      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      runTransformAndWaitForSuccess();
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
      getTransformPage().button("Change target").click();
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

      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the table");
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();

      cy.log("modify the transform after running");
      getTransformPage().button("Change target").click();
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

      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the new table");
      runTransformAndWaitForSuccess();
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
      runTransformAndWaitForSuccess();

      cy.log("modify the transform after running");
      getTransformPage().button("Change target").click();
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

      getTableLink()
        .should("have.text", TARGET_TABLE_2)
        .should("have.attr", "aria-disabled", "true");

      cy.log("run the transform and verify the new table");
      runTransformAndWaitForSuccess();

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
      runTransformAndWaitForSuccess();

      cy.log("delete the old target without creating the new one");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Delete transform_table").click();
        cy.button("Change target and delete old table").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@updateTransform");
      });

      cy.log("change the target back to the original one");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("New table name").clear().type(TARGET_TABLE);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });

      cy.log("run the transform to re-create the original target");
      runTransformAndWaitForSuccess();

      cy.log("verify the target is available");
      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should not allow to overwrite an existing table when changing the target", () => {
      createMbqlTransform({ visitTransform: true });

      cy.log("change the target to an existing table");
      getTransformPage().button("Change target").click();
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
      getTransformPage()
        .findByText("Edit this table’s metadata")
        .should("not.exist");

      cy.log("after table creation");
      runTransformAndWaitForSuccess();
      getTransformPage().findByText("Edit this table’s metadata").click();
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
      getSchemaLink().should("have.text", TARGET_SCHEMA);
      getSchemaLink().click();
      H.main().within(() => {
        cy.findByText("Animals").should("be.visible");
        cy.findByText("Transform Table").should("not.exist");
      });

      cy.log("after table creation");
      cy.go("back");
      runTransformAndWaitForSuccess();
      getSchemaLink().click();
      H.main().within(() => {
        cy.findByText("Animals").should("be.visible");
        cy.findByText("Transform Table").should("be.visible");
      });
    });

    it("should be able to see the target database", () => {
      cy.log("before table creation");
      createMbqlTransform({ visitTransform: true });
      getDatabaseLink().should("have.text", DB_NAME);
      getDatabaseLink().click();
      H.main().within(() => {
        cy.findByText(TARGET_SCHEMA).should("be.visible");
        cy.findByText(TARGET_SCHEMA_2).should("be.visible");
      });

      cy.log("after table creation");
      cy.go("back");
      runTransformAndWaitForSuccess();
      getDatabaseLink().click();
      H.main().within(() => {
        cy.findByText(TARGET_SCHEMA).should("be.visible");
        cy.findByText(TARGET_SCHEMA_2).should("be.visible");
      });
    });
  });

  describe("queries", () => {
    it("should render a readOnly preview of the MBQL query", () => {
      cy.log("create a new transform that has all the steps");
      H.getTableId({ name: "Animals" }).then((tableId) => {
        H.getFieldId({ tableId, name: "score" }).then((ANIMAL_SCORE) => {
          H.getFieldId({ tableId, name: "name" }).then((ANIMAL_NAME) => {
            H.createTransform(
              {
                name: "MBQL transform",
                source: {
                  type: "query",
                  query: {
                    database: WRITABLE_DB_ID,
                    type: "query",
                    query: {
                      "source-table": tableId,
                      filter: [">", ["field", ANIMAL_SCORE, {}], 10],
                      aggregation: [
                        ["count"],
                        [
                          "aggregation-options",
                          ["+", ["count"], 1],
                          { name: "Foobar", "display-name": "Foobar" },
                        ],
                      ],
                      expressions: {
                        ScorePlusOne: ["+", ["field", ANIMAL_SCORE, {}], 1],
                      },
                      breakout: [
                        [
                          "field",
                          ANIMAL_SCORE,
                          {
                            binning: { strategy: "num-bins", "num-bins": 10 },
                          },
                        ],
                      ],
                      joins: [
                        {
                          "source-table": tableId,
                          condition: [
                            "=",
                            ["field", ANIMAL_SCORE, {}],
                            ["field", ANIMAL_SCORE, {}],
                          ],
                          alias: "animal_score",
                        },
                      ],
                      limit: 10,
                      "order-by": [["asc", ["field", ANIMAL_NAME, {}]]],
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
          });
        });
      });

      cy.log("Data step should be read-only");
      H.getNotebookStep("data")
        .findByRole("button")
        .should("contain", "Animals")
        .should("be.disabled");

      cy.log("Join step should be read-only");
      H.getNotebookStep("join")
        .findAllByText("Animals")
        .should("have.length", 4)
        .eq(1)
        .should("have.css", "pointer-events", "none");

      cy.findByLabelText("Change join type").should("be.disabled");

      H.getNotebookStep("join")
        .findAllByText("Score")
        .should("have.length", 2)
        .first()
        .click();
      assertNoModals();

      H.getNotebookStep("join")
        .findAllByText("Score")
        .should("have.length", 2)
        .eq(1)
        .click();
      assertNoModals();

      cy.log("Expression step should be read-only, but render editor");
      H.getNotebookStep("expression").findByText("ScorePlusOne").click();
      H.CustomExpressionEditor.value().should("equal", "[Score] + 1");
      H.CustomExpressionEditor.nameInput()
        .should("have.value", "ScorePlusOne")
        .should("have.attr", "readonly");
      H.popover().button("Done").click();

      cy.log("Expression step should be read-only, but render popover");
      H.getNotebookStep("filter")
        .findByText("Score is greater than 10")
        .click();
      H.popover().within(() => {
        cy.findByText("Score").should("be.visible");
        cy.findByText("Greater than").should("be.visible");
        cy.findByPlaceholderText("Enter a number")
          .should("be.visible")
          .should("have.value", 10);
      });
      H.main().click();

      cy.log("Summarize step should be read-only");
      H.getNotebookStep("summarize").findByText("Count").click();
      H.CustomExpressionEditor.value().should("equal", "Count()");
      H.CustomExpressionEditor.nameInput()
        .should("have.value", "Count")
        .should("have.attr", "readonly");
      H.popover().button("Done").click();

      H.getNotebookStep("summarize").findByText("Foobar").click();
      H.CustomExpressionEditor.value().should("equal", "Count() + 1");
      H.CustomExpressionEditor.nameInput()
        .should("have.value", "Foobar")
        .should("have.attr", "readonly");
      H.popover().button("Done").click();

      H.getNotebookStep("summarize").findByText("Score: 10 bins").click();
      assertNoModals();

      cy.log("Sort step should be read-only");
      H.getNotebookStep("sort").findByText("Name").click();
      assertNoModals();

      cy.log("Limit step should be read-only");
      H.getNotebookStep("limit")
        .findByPlaceholderText("Enter a limit")
        .should("have.value", 10)
        .should("have.attr", "readonly");

      function assertNoModals() {
        H.entityPickerModal().should("not.exist");
        H.popover({ skipVisibilityCheck: true }).should("not.exist");
      }
    });

    it("should hide empty sections in read-only mode", () => {
      H.getTableId({ name: "Animals" }).then((tableId) => {
        H.createTransform(
          {
            name: "MBQL transform",
            source: {
              type: "query",
              query: {
                database: WRITABLE_DB_ID,
                type: "query",
                query: {
                  "source-table": tableId,
                  aggregation: [["count"]],
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

        H.getNotebookStep("summarize")
          .scrollIntoView()
          .should("be.visible")
          .within(() => {
            cy.findByText("by").should("not.exist");
            cy.findByTestId("breakout-step").should("not.exist");
          });
      });
    });

    it("should be able to update a MBQL query", () => {
      cy.log("create a new transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("update the query");
      getTransformPage().findByRole("link", { name: "Edit query" }).click();
      H.getNotebookStep("data").button("Filter").click();
      H.popover().within(() => {
        cy.findByText("Name").click();
        cy.findByText("Duck").click();
        cy.button("Add filter").click();
      });

      getQueryEditor().button("Save changes").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      runTransformAndWaitForSuccess();
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

      cy.log("update the query");
      getTransformPage().findByRole("link", { name: "Edit query" }).click();
      H.NativeEditor.type(" WHERE name = 'Duck'");
      getQueryEditor().button("Save changes").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      runTransformAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });

    it("should be able to update a Python query", { tags: ["@python"] }, () => {
      setPythonRunnerSettings();
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

      cy.log("update the query");
      getTransformPage().findByRole("link", { name: "Edit script" }).click();
      H.PythonEditor.type("{backspace}{backspace}{backspace} + 10 }])");

      getQueryEditor().button("Save changes").click();
      cy.wait("@updateTransform");

      cy.log("run the transform and make sure the query has changed");
      runTransformAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(1);
    });
  });

  describe("runs", () => {
    it("should be able to navigate to a list of runs", () => {
      cy.log("create and run a transform");
      createMbqlTransform({
        targetTable: TARGET_TABLE,
        visitTransform: true,
      });
      runTransformAndWaitForSuccess();

      cy.log("create and run another transform");
      createSqlTransform({
        sourceQuery: `SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`,
        targetTable: TARGET_TABLE_2,
        visitTransform: true,
      });
      runTransformAndWaitForSuccess();

      cy.log("assert that the list is filtered by the current transform");
      getRunListLink().click();
      getContentTable().within(() => {
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
      getTransformPage().button("Delete transform").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("not.exist");
        cy.findByLabelText("Delete the transform and the table").should(
          "not.exist",
        );
        cy.button("Delete transform").click();
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");
      getTransformListPage().findByText("MBQL transform").should("not.exist");
    });

    it("should be able to delete a transform and keep the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      runTransformAndWaitForSuccess();

      cy.log("delete the transform but keep the table");
      getTransformPage().button("Delete transform").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("be.checked");
        cy.button("Delete transform only").click();
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");

      cy.log("make sure the table still exists");
      visitTableQuestion();
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to delete a transform and delete the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      runTransformAndWaitForSuccess();

      cy.log("delete the transform and the table");
      getTransformPage().button("Delete transform").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform and the table").click();
        cy.button("Delete transform and table").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");

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
      getRunButton().click();
      getRunButton().should("have.text", "Running now…");
      getRunStatus().should("have.text", "Run in progress…");

      getNavSidebar().findByText("Runs").click();
      getContentTable().within(() => {
        cy.findByText("In progress").should("be.visible");
        cy.findByLabelText("Cancel run").click();
      });

      H.modal().button("Yes").click();

      getContentTable().findByText("Canceling").should("be.visible");
      getContentTable()
        .findByText("Canceled", { timeout: 30_000 })
        .should("be.visible");
    });

    it("should show a message when the run finished before it cancels", () => {
      createSlowTransform(1);
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
      getRunSection().should(
        "contain",
        "This run succeeded before it had a chance to cancel.",
      );
    });

    it("should be possible to cancel a SQL transform from the preview (metabase#64474)", () => {
      createSlowTransform(500);
      getTransformPage().findByText("Edit query").click();

      getQueryEditor().within(() => {
        cy.findAllByTestId("run-button").eq(0).click();
        cy.findByTestId("loading-indicator").should("be.visible");

        cy.findAllByTestId("run-button").eq(0).click();
        cy.findByTestId("loading-indicator").should("not.exist");
      });
    });
  });

  describe("dependencies", () => {
    it("should render a table of dependencies", () => {
      createMbqlTransform({
        name: "Transform A",
        targetTable: "table_a",
        visitTransform: true,
      }).then(runTransformAndWaitForSuccess);

      createMbqlTransform({
        name: "Transform B",
        sourceTable: "table_a",
        targetTable: "table_b",
        visitTransform: true,
      }).then(runTransformAndWaitForSuccess);

      createMbqlTransform({
        name: "Transform C",
        sourceTable: "table_b",
        targetTable: "table_c",
        visitTransform: true,
      });

      H.main().findByText("Dependencies").scrollIntoView().should("be.visible");
      getContentTable().within(() => {
        // 1 transform plus the header row
        cy.findAllByRole("row").should("have.length", 2);

        // Check the existence and also their order
        cy.findAllByRole("row").eq(1).should("contain", "Transform B");
      });
    });

    it("should no dependencies table if the transform has no dependencies", () => {
      createMbqlTransform({ name: "Transform A", visitTransform: true });
      H.main().findByText("Dependencies").should("not.exist");
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
        setPythonRunnerSettings();
        createPythonLibrary(
          "common.py",
          dedent`
            def useful_calculation(a, b):
              return a + b
          `,
        );

        visitTransformListPage();
        getTransformListPage().button("Create a transform").click();
        H.popover().findByText("Python script").click();

        H.PythonEditor.clear().type(
          dedent`
            import pandas as pd

            def transform():
                return pd.DataFrame([{"foo": common.useful_calculation(1, 2)}])
          `,
          { allowFastSet: true },
        );

        getQueryEditor().findByText("Import common library").click();
        H.PythonEditor.value().should("contain", "import common");

        cy.findByTestId("python-data-picker")
          .findByText("Select a database")
          .click();

        H.popover().findByText(DB_NAME).click();

        cy.findByTestId("python-data-picker").should("not.be.disabled");

        cy.findByTestId("python-data-picker")
          .findByText("Select a table…")
          .click();

        H.entityPickerModal().within(() => {
          cy.findByText("Schema a").click();
          cy.findByText("Animals").click();
        });

        getQueryEditor().button("Save").click();

        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type("Python transform");
          cy.findByLabelText("Table name").clear().type("python_transform");
          cy.button("Save").click();
        });

        runTransformAndWaitForSuccess();
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
        runTransformAndWaitForSuccess();
        getTableLink().click();
        H.queryBuilderHeader()
          .findByText("Python Transform")
          .should("be.visible");
        H.assertQueryBuilderRowCount(1);
        cy.findByTestId("scalar-value").should("have.text", "43");
      },
    );

    function visitCommonLibrary(path = "common.py") {
      cy.visit(`/admin/transforms/library/${path}`);
    }

    function getLibraryEditorHeader() {
      return cy.findByTestId("library-editor-header");
    }
  });
});

describe("scenarios > admin > transforms > databases without :schemas", () => {
  const DB_NAME = "QA MySQL8";

  beforeEach(() => {
    H.restore("mysql-8");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/ee/transform").as("createTransform");
    cy.intercept("PUT", "/api/ee/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/ee/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/ee/transform/*/table").as(
      "deleteTransformTable",
    );
    cy.intercept("POST", "/api/ee/transform-tag").as("createTag");
    cy.intercept("PUT", "/api/ee/transform-tag/*").as("updateTag");
    cy.intercept("DELETE", "/api/ee/transform-tag/*").as("deleteTag");
  });

  it("should be not be possible to create a new schema when updating a transform target", () => {
    createMbqlTransform({
      databaseId: WRITABLE_DB_ID,
      sourceTable: "ORDERS",
      visitTransform: true,
      targetSchema: null,
    });

    getTransformPage().button("Change target").click();

    H.modal().findByLabelText("Schema").should("not.exist");
  });

  it("should be not be possible to create a new schema when the database does not support schemas", () => {
    cy.log("create a new transform");
    visitTransformListPage();
    getTransformListPage().button("Create a transform").click();
    H.popover().findByText("Query builder").click();

    H.entityPickerModal().within(() => {
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

    cy.intercept("POST", "/api/ee/transform-job").as("createJob");
    cy.intercept("PUT", "/api/ee/transform-job/*").as("updateJob");
    cy.intercept("DELETE", "/api/ee/transform-job/*").as("deleteJob");
  });

  describe("creation", () => {
    it("should be able to create a job with default properties", () => {
      visitJobListPage();
      getJobListPage().findByRole("link", { name: "Create a job" }).click();

      getJobPage().button("Save").click();
      cy.wait("@createJob");
      H.undoToast().findByText("New job created").should("be.visible");

      getJobPage().within(() => {
        cy.findByPlaceholderText("Name").should("have.value", "New job");
        cy.findByPlaceholderText("No description yet").should("have.value", "");
        getScheduleFrequencyInput().should("have.value", "daily");
        getScheduleTimeInput().should("have.value", "12:00");
      });
    });

    it("should be able to create a job with custom property values", () => {
      visitJobListPage();
      getJobListPage().findByRole("link", { name: "Create a job" }).click();

      getJobPage().within(() => {
        cy.findByPlaceholderText("Name").clear().type("Job");
        cy.findByPlaceholderText("No description yet")
          .clear()
          .type("Description");
        getScheduleFrequencyInput().click();
      });
      H.popover().findByText("custom").click();
      getJobPage().within(() => {
        getCronInput().clear().type("0 * * * ?");
        getTagsInput().click();
      });
      H.popover().findByText("daily").click();
      getJobPage().button("Save").click();
      cy.wait("@createJob");
      H.undoToast().findByText("New job created").should("be.visible");

      getJobPage().within(() => {
        cy.findByPlaceholderText("Name").should("have.value", "Job");
        cy.findByPlaceholderText("No description yet").should(
          "have.value",
          "Description",
        );
        getCronInput().should("have.value", "0 * * * ?");
        cy.findByText(/This job will run every hour/).should("be.visible");
        cy.findByText("daily").should("be.visible");
      });
    });
  });

  describe("name and description", () => {
    it("should be able to edit the name and description after creation", () => {
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });

      getJobPage()
        .findByPlaceholderText("Name")
        .clear()
        .type("New name")
        .blur();
      H.undoToast().findByText("Job name updated").should("be.visible");
      getJobPage()
        .findByPlaceholderText("Name")
        .should("have.value", "New name");

      getJobPage()
        .findByPlaceholderText("No description yet")
        .clear()
        .type("New description")
        .blur();
      H.undoToastList()
        .should("have.length", 2)
        .last()
        .findByText("Job description updated")
        .should("be.visible");
      getJobPage()
        .findByPlaceholderText("No description yet")
        .should("have.value", "New description");
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
      getContentTable().within(() => {
        cy.findAllByText("MBQL transform").should("have.length.gte", 1);
        cy.findAllByText("Success").should("have.length.gte", 1);
        cy.findAllByText("Schedule").should("have.length.gte", 1);
      });
    });

    it("should be able to change the schedule after creation", () => {
      H.createTransformJob({ name: "New job" }, { visitTransformJob: true });
      getJobPage().within(() => {
        getScheduleFrequencyInput().click();
      });
      H.popover().findByText("weekly").click();
      H.undoToast().findByText("Job schedule updated").should("be.visible");
      getJobPage().within(() => {
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
        getJobListPage().findByText(jobName).click();
        getJobPage().within(() => {
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

  H.describeWithSnowplowEE("runs", () => {
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
        triggered_from: "job-page",
      });

      getJobPage()
        .findByText("Last ran a few seconds ago successfully.")
        .should("be.visible");

      getNavSidebar().findByText("Runs").click();
      getContentTable().within(() => {
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
      getJobPage().findByText("Last run failed a few seconds ago.");
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
      getJobPage().button("Delete this job").click();
      H.modal().within(() => {
        cy.button("Delete job").click();
        cy.wait("@deleteJob");
      });
      getJobListPage().should("be.visible");
      getJobListPage().findByText("New job").should("not.exist");
    });
  });

  describe("default jobs and tags", () => {
    it("should pre-create default jobs and tags", () => {
      const jobNames = ["Hourly job", "Daily job", "Weekly job", "Monthly job"];
      const tagNames = ["hourly", "daily", "weekly", "monthly"];

      cy.log("make sure that default jobs are created");
      visitJobListPage();
      getContentTable().within(() => {
        jobNames.forEach((jobName) =>
          cy.findByText(jobName).should("be.visible"),
        );
        tagNames.forEach((tagName) =>
          cy.findByText(tagName).should("be.visible"),
        );
      });

      cy.log("make sure that default tags are available for selection");
      getJobListPage().findByRole("link", { name: "Create a job" }).click();
      getTagsInput().click();
      H.popover().within(() => {
        tagNames.forEach((tagName) =>
          cy.findByText(tagName).should("be.visible"),
        );
      });
    });
  });

  describe("filtering", () => {
    it("should be able to filter jobs ", () => {
      cy.log("run hourly job so know that was recently run");
      visitJobListPage();
      getContentTable().findByText("Hourly job").click();
      runJobAndWaitForSuccess();
      visitJobListPage();

      function testLastRunDateFilter() {
        cy.log("no filters");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });

        cy.log("last run at - add a filter");
        getLastRunDateFilterWidget().click();
        H.popover().findByText("Previous month").click();

        getLastRunDateFilterWidget().should("contain", "Previous month");
        getContentTable().should("not.exist");

        cy.log("last run at filter - remove filter");
        getLastRunDateFilterWidget().button("Remove filter").click();
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });
      }

      function testLastRunStatusFilter() {
        cy.log("no filters");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });

        cy.log("last run status - add a filter");
        getLastRunStatusFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("In progress").click();
          cy.findByText("Success").click();
          cy.button("Add filter").click();
        });

        getLastRunStatusFilterWidget().should("contain", "2 statuses");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("not.exist");
          cy.findByText("Weekly job").should("not.exist");
          cy.findByText("Monthly job").should("not.exist");
        });

        cy.log("last run at filter - remove filter");
        getLastRunStatusFilterWidget().button("Remove filter").click();
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });
      }

      function testNextRunDateFilter() {
        cy.log("no filters");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });

        cy.log("next run - add a filter");
        getNextRunDateFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("Fixed date range…").click();
          cy.findByLabelText("Start date").clear().type("12/10/2024");
          cy.findByLabelText("End date").clear().type("01/05/2025");
          cy.button("Apply").click();
        });

        getNextRunDateFilterWidget().should(
          "contain",
          "December 10, 2024 - January 5, 2025",
        );
        getContentTable().should("not.exist");

        cy.log("next run filter - remove filter");
        getNextRunDateFilterWidget().button("Remove filter").click();
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });
      }

      function testTagFilter() {
        cy.log("no filters");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });

        cy.log("tag filter - add a filter");
        getTagFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("hourly").click();
          cy.button("Add filter").click();
        });
        getTagFilterWidget().findByText("hourly").should("be.visible");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("not.exist");
          cy.findByText("Weekly job").should("not.exist");
          cy.findByText("Monthly job").should("not.exist");
        });

        cy.log("tag filter - update a filter");
        getTagFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("hourly").click();
          cy.findByText("weekly").click();
          cy.button("Update filter").click();
        });

        getTagFilterWidget().findByText("weekly").should("be.visible");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("not.exist");
          cy.findByText("Daily job").should("not.exist");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("not.exist");
        });

        cy.log("tag filter - multiple options");
        getTagFilterWidget().click();
        H.popover().within(() => {
          cy.findByText("monthly").click();
          cy.button("Update filter").click();
        });
        getTagFilterWidget().findByText("2 tags").should("be.visible");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("not.exist");
          cy.findByText("Daily job").should("not.exist");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });

        cy.log("tag filter - remove filter");
        getTagFilterWidget().button("Remove filter").click();
        getTagFilterWidget().findByText("2 tags").should("not.exist");
        getContentTable().within(() => {
          cy.findByText("Hourly job").should("be.visible");
          cy.findByText("Daily job").should("be.visible");
          cy.findByText("Weekly job").should("be.visible");
          cy.findByText("Monthly job").should("be.visible");
        });
      }

      testLastRunDateFilter();
      testLastRunStatusFilter();
      testNextRunDateFilter();
      testTagFilter();
    });
  });

  describe("dependencies", () => {
    it("should render a table of dependencies", () => {
      createMbqlTransform({
        name: "Transform A",
        targetTable: "table_a",
        visitTransform: true,
      }).then(runTransformAndWaitForSuccess);

      createMbqlTransform({
        name: "Transform B",
        sourceTable: "table_a",
        targetTable: "table_b",
        visitTransform: true,
      }).then(runTransformAndWaitForSuccess);

      createMbqlTransform({
        name: "Transform C",
        sourceTable: "table_b",
        targetTable: "table_c",
        visitTransform: true,
      });

      H.main().findByText("Dependencies").scrollIntoView().should("be.visible");
      getContentTable().within(() => {
        // 1 transform plus the header row
        cy.findAllByRole("row").should("have.length", 2);

        // Check the existence and also their order
        cy.findAllByRole("row").eq(1).should("contain", "Transform B");
      });
    });

    it("should no dependencies table if the transform has no dependencies", () => {
      createMbqlTransform({ name: "Transform A", visitTransform: true });
      H.main().findByText("Dependencies").should("not.exist");
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
          runTransformAndWaitForSuccess();
          createSqlTransform({
            sourceQuery: "SELECT * FROM abc",
            targetTable: TARGET_TABLE_2,
            tagIds: [tag2.id],
            visitTransform: true,
          });
          runTransformAndWaitForFailure();
        });
      });
    }

    function testTransformFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
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
      getContentTable().within(() => {
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
      getContentTable().within(() => {
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
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - remove filter");
      getTransformFilterWidget().button("Remove filter").click();
      getTransformFilterWidget().findByText("2 transforms").should("not.exist");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testStatusFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
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
      getContentTable().within(() => {
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
      getContentTable().within(() => {
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
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("transform filter - remove filter");
      getStatusFilterWidget().button("Remove filter").click();
      getStatusFilterWidget().findByText("2 statuses").should("not.exist");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testTagFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
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
      getContentTable().within(() => {
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
      getContentTable().within(() => {
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
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("tag filter - remove filter");
      getTagFilterWidget().button("Remove filter").click();
      getTagFilterWidget().findByText("2 tags").should("not.exist");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testRunMethodFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
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
      getContentTable().within(() => {
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

      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("run method filter - remove filter");
      getRunMethodFilterWidget().button("Remove filter").click();
      getRunMethodFilterWidget()
        .findByText("Schedule, Manual")
        .should("not.exist");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testStartAtFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("today");
      getStartAtFilterWidget().click();
      H.popover().findByText("Today").click();
      getStartAtFilterWidget().findByText("Today").should("be.visible");
      getContentTable().within(() => {
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
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      getStartAtFilterWidget().button("Remove filter").click();
      getStartAtFilterWidget().click();
      H.popover().findByText("Previous week").click();
      getStartAtFilterWidget().findByText("Previous week").should("be.visible");
      H.main().findByText("No runs found").should("be.visible");

      getStartAtFilterWidget().button("Remove filter").click();
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    function testEndAtFilter() {
      cy.log("no filters");
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      cy.log("today");
      getEndAtFilterWidget().click();
      H.popover().findByText("Today").click();
      getEndAtFilterWidget().findByText("Today").should("be.visible");
      getContentTable().within(() => {
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
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });

      getEndAtFilterWidget().button("Remove filter").click();
      getEndAtFilterWidget().click();
      H.popover().findByText("Previous week").click();
      getEndAtFilterWidget().findByText("Previous week").should("be.visible");
      H.main().findByText("No runs found").should("be.visible");

      getEndAtFilterWidget().button("Remove filter").click();
      getContentTable().within(() => {
        cy.findByText("MBQL transform").should("be.visible");
        cy.findByText("SQL transform").should("be.visible");
      });
    }

    createInitialData();
    getNavSidebar().findByText("Runs").click();
    testTransformFilter();
    testStatusFilter();
    testTagFilter();
    testRunMethodFilter();
    testStartAtFilter();
    testEndAtFilter();
  });
});

H.describeWithSnowplowEE(
  "scenarios > admin > transforms > python runner",
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_schemas" });
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

      setPythonRunnerSettings();
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

      getTransformPage().findByText("Edit script").click();

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
  },
);

function getTransformListPage() {
  return cy.findByTestId("transform-list-page");
}

function getTransformPage() {
  return cy.findByTestId("transform-page");
}

function getJobListPage() {
  return cy.findByTestId("job-list-page");
}

function getJobPage() {
  return cy.findByTestId("job-view");
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

function getRunSection() {
  return cy.findByTestId("run-section");
}

function getRunListLink() {
  return cy.findByRole("link", { name: "See all runs" });
}

function getRunErrorInfoButton() {
  return cy.findByLabelText("See error");
}

function getTableLink() {
  return cy.findByTestId("table-link");
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

function getContentTable() {
  return cy.findByTestId("admin-content-table");
}

function getNavSidebar() {
  return cy.findByTestId("transform-sidebar");
}

function getTransformFilterWidget() {
  return cy.findByRole("group", { name: "Transform" });
}

function getLastRunDateFilterWidget() {
  return cy.findByRole("group", { name: "Last run at" });
}

function getLastRunStatusFilterWidget() {
  return cy.findByRole("group", { name: "Last run status" });
}

function getNextRunDateFilterWidget() {
  return cy.findByRole("group", { name: "Next run at" });
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
  return cy.visit("/admin/transforms");
}

function visitJobListPage() {
  return cy.visit("/admin/transforms/jobs");
}

function visitRunListPage() {
  return cy.visit("/admin/transforms/runs");
}

function runTransformAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
  return getTableLink().should("have.attr", "href");
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

function createMbqlTransform({
  sourceTable = SOURCE_TABLE,
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
  tagIds,
  databaseId,
  name = "MBQL transform",
  visitTransform,
}: {
  sourceTable?: string;
  targetTable?: string;
  targetSchema?: string | null;
  tagIds?: TransformTagId[];
  name?: string;
  databaseId?: number;
  visitTransform?: boolean;
} = {}) {
  return H.getTableId({ databaseId, name: sourceTable }).then((tableId) => {
    return H.createTransform(
      {
        name,
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "query",
            query: {
              "source-table": tableId,
              limit: 5,
            },
          },
        },
        target: {
          type: "table",
          database: WRITABLE_DB_ID,
          name: targetTable,
          schema: targetSchema,
        },
        tag_ids: tagIds,
      },
      { visitTransform },
    );
  });
}

function createSqlTransform({
  sourceQuery,
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
  tagIds,
  visitTransform,
}: {
  sourceQuery: string;
  targetTable?: string;
  targetSchema?: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
}) {
  H.createTransform(
    {
      name: "SQL transform",
      source: {
        type: "query",
        query: {
          database: WRITABLE_DB_ID,
          type: "native",
          native: {
            query: sourceQuery,
          },
        },
      },
      target: {
        type: "table",
        database: WRITABLE_DB_ID,
        name: targetTable,
        schema: targetSchema,
      },
      tag_ids: tagIds,
    },
    { wrapId: true, visitTransform },
  );
}
function createPythonTransform({
  body,
  sourceTables,
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
  tagIds,
  visitTransform,
}: {
  body: string;
  sourceTables: PythonTransformTableAliases;
  targetTable?: string;
  targetSchema?: string;
  tagIds?: TransformTagId[];
  visitTransform?: boolean;
}) {
  H.createTransform(
    {
      name: "Python transform",
      source: {
        type: "python",
        "source-database": WRITABLE_DB_ID,
        "source-tables": sourceTables,
        body,
      },
      target: {
        type: "table",
        database: WRITABLE_DB_ID,
        name: targetTable,
        schema: targetSchema,
      },
      tag_ids: tagIds,
    },
    { wrapId: true, visitTransform },
  );
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

function setPythonRunnerSettings() {
  H.updateEnterpriseSetting("python-runner-url", "http://localhost:5001");
  H.updateEnterpriseSetting("python-runner-api-token", "dev-token-12345");
  H.updateEnterpriseSetting(
    "python-storage-s-3-endpoint",
    "http://localhost:4566",
  );
  H.updateEnterpriseSetting("python-storage-s-3-region", "us-east-1");
  H.updateEnterpriseSetting(
    "python-storage-s-3-bucket",
    "metabase-python-runner",
  );
  H.updateEnterpriseSetting("python-storage-s-3-prefix", "test-prefix");
  H.updateEnterpriseSetting("python-storage-s-3-access-key", "test");
  H.updateEnterpriseSetting("python-storage-s-3-secret-key", "test");
  H.updateEnterpriseSetting(
    "python-storage-s-3-container-endpoint",
    "http://localstack:4566",
  );
  H.updateEnterpriseSetting("python-storage-s-3-path-style-access", true);
}

function runPythonScriptAndWaitForSuccess() {
  getQueryEditor().findByTestId("run-button").click();

  getQueryEditor()
    .findByTestId("loading-indicator", { timeout: 60000 })
    .should("not.exist");

  cy.findByTestId("python-results").should("be.visible");
}
