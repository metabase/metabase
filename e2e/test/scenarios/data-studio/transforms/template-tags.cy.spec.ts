import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_SCHEMA = "Schema A";
const TARGET_TABLE = "transform_table";

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

  it("should be possible to use template tags in SQL transform", () => {
    H.createTestNativeQuery({
      database: WRITABLE_DB_ID,
      query: "SELECT 1",
    })
      .then((query) =>
        H.createTransform(
          {
            name: "MBQL",
            source: {
              type: "query",
              query,
            },
            target: {
              type: "table",
              database: WRITABLE_DB_ID,
              name: TARGET_TABLE,
              schema: TARGET_SCHEMA,
            },
          },
          { wrapId: true },
        ),
      )
      .then((transformId) => {
        cy.visit(`/data-studio/transforms/${transformId}`);
      });

    function testSimpleTemplateTag(
      name: string,
      type: string,
      setDefaultValue: () => void,
    ) {
      H.DataStudio.Transforms.clickEditDefinition();

      H.NativeEditor.clear()
        .type(`SELECT {{ ${name} }}`, {
          allowFastSet: true,
        })
        .blur();

      cy.findByTestId("native-query-top-bar")
        .findByLabelText("Variables")
        .click();

      editorSidebar().findByLabelText("Variable type").click();
      H.popover().findByText(type).click();

      cy.log(
        "try saving transform, an error is shown about missing parameters",
      );
      queryEditor().button("Save").should("be.enabled").click();
      H.undoToast()
        .should("contain.text", "missing required parameters")
        .icon("close")
        .click();

      editorSidebar()
        .findByText("Always require a value")
        .scrollIntoView()
        .should("be.visible")
        .click();

      queryEditor().button("Save").should("be.disabled");

      editorSidebar()
        .findByText(/Default filter widget value/)
        .scrollIntoView();
      setDefaultValue();

      queryEditor().button("Save").should("be.enabled").click();
      H.undoToast()
        .should("have.text", "Transform query updated")
        .icon("close")
        .click();
      assertIsTransformRunnable();
    }

    function testFieldTemplateTag() {
      H.DataStudio.Transforms.clickEditDefinition();

      H.NativeEditor.clear()
        .type('SELECT * from "Schema A"."Animals" WHERE {{ dim }}', {
          allowFastSet: true,
        })
        .blur();

      cy.findByTestId("native-query-top-bar")
        .findByLabelText("Variables")
        .click();

      editorSidebar().findByLabelText("Variable type").click();
      H.popover().findByText("Field Filter").click();

      H.popover().findByText("Schema a").click();
      H.popover().findByText("Animals").click();
      H.popover().findByText("Score").click();

      editorSidebar()
        .findByText("Always require a value")
        .scrollIntoView()
        .should("be.visible")
        .click();

      queryEditor().button("Save").should("be.disabled");

      editorSidebar()
        .findByText("Enter a default value…")
        .scrollIntoView()
        .click();

      H.popover().within(() => {
        cy.findByText("10").click();
        cy.button("Update filter").click();
      });

      cy.log("saving works");
      queryEditor().button("Save").should("be.enabled").click();
      H.undoToast()
        .should("have.text", "Transform query updated")
        .icon("close")
        .click();
      assertIsTransformRunnable();
    }

    function testTableTemplateTag() {
      H.DataStudio.Transforms.clickEditDefinition();

      H.NativeEditor.clear()
        .type("SELECT * from {{ table }}", { allowFastSet: true })
        .blur();

      cy.findByTestId("native-query-top-bar")
        .findByLabelText("Variables")
        .click();

      editorSidebar().findByLabelText("Variable type").click();
      H.popover().findByText("Table").click();

      H.popover().findByText("Schema a").click();
      H.popover().findByText("Animals").click();

      queryEditor().button("Save").should("be.enabled").click();
      H.undoToast()
        .should("have.text", "Transform query updated")
        .icon("close")
        .click();
      assertIsTransformRunnable();
    }

    testSimpleTemplateTag("text", "Text", () =>
      editorSidebar()
        .findByPlaceholderText("Enter a default value…")
        .type("Foo"),
    );
    testSimpleTemplateTag("number", "Number", () =>
      editorSidebar()
        .findByPlaceholderText("Enter a default value…")
        .type("42"),
    );
    testSimpleTemplateTag("bool", "Boolean", () => {
      editorSidebar()
        .findByText("Enter a default value…")
        .scrollIntoView()
        .click();
      H.popover().button("Add filter").click();
    });
    testSimpleTemplateTag("date", "Date", () => {
      editorSidebar().findByText("Select a default value…").click();
      H.popover().button("Add filter").click();
    });
    testFieldTemplateTag();
    testTableTemplateTag();
  });

  it("should be possible to add multiple template tags", () => {
    cy.log("create a new transform");
    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("SQL query").click();

    cy.log("Add a query with multiple template tags");
    H.NativeEditor.clear()
      .type(
        'SELECT * from "Schema A"."Animals" WHERE name = {{ name }} AND score > {{ min_score }}',
        { allowFastSet: true },
      )
      .blur();

    cy.log("saving does not work out of the box");
    queryEditor().button("Save").click();
    H.modal().within(() => {
      cy.findByPlaceholderText("My Great Transform").type("Foo");
      cy.button("Save").click();
      cy.findByText(/missing required parameters/i).should("be.visible");
      cy.button("Back").click();
    });

    cy.log("Open the variables sidebar");
    cy.findByTestId("native-query-top-bar")
      .findByLabelText("Variables")
      .click();

    editorSidebar()
      .findAllByText("Always require a value")
      .should("have.length", 2)
      .eq(0)
      .scrollIntoView()
      .click();

    editorSidebar()
      .findAllByText("Always require a value")
      .should("have.length", 2)
      .eq(1)
      .scrollIntoView()
      .click();

    queryEditor().button("Save").should("be.disabled");

    cy.log("Configure the first template tag default");
    editorSidebar()
      .findAllByPlaceholderText("Enter a default value…")
      .should("have.length", 2)
      .eq(0)
      .type("Default Name");

    queryEditor().button("Save").should("be.disabled");

    cy.log("Configure the second template tag");
    editorSidebar()
      .findAllByLabelText("Variable type")
      .should("have.length", 2)
      .eq(1)
      .click();
    H.popover().findByText("Number").click();
    editorSidebar()
      .findAllByPlaceholderText("Enter a default value…")
      .should("have.length", 2)
      .eq(1)
      .type("42");

    cy.log("Save the transform with all template tags configured");
    queryEditor().button("Save").should("be.enabled").click();
    H.modal().within(() => {
      cy.findByPlaceholderText("My Great Transform").type("Foo");
      cy.button("Save").click();
    });
    assertIsTransformRunnable();
  });
});

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function queryEditor() {
  return cy.findByTestId("transform-query-editor");
}

function editorSidebar() {
  return cy.findByTestId("editor-sidebar");
}

function assertIsTransformRunnable() {
  H.DataStudio.Transforms.runTab().click();
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
  H.DataStudio.Transforms.definitionTab().click();
}

function getRunButton(options: { timeout?: number } = {}) {
  return cy.findAllByTestId("run-button").eq(0, options);
}
