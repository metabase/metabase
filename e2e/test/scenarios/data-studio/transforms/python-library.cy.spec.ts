import dedent from "ts-dedent";

const { H } = cy;

describe("scenarios > data studio > transforms > python library", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
    // Python library row only appears when we have at least one transform
    H.createSqlTransform({
      sourceQuery: "SELECT 1",
      targetTable: "table_a",
      targetSchema: "Schema A",
    });
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should allow editing the python library", () => {
    H.DataStudio.Transforms.visit();
    H.DataStudio.Transforms.list()
      .findByText("Python library")
      .should("be.visible");
    cy.findByRole("link", { name: /Python library/ }).click();

    cy.url().should("include", "/data-studio/transforms/library/common.py");
    H.DataStudio.PythonLibrary.header().should("be.visible");
    H.DataStudio.PythonLibrary.editor().should("be.visible");

    cy.log("make sure placeholder with help comment is displayed");
    H.DataStudio.PythonLibrary.editor()
      .findByText(/# This is your Python library/)
      .should("be.visible");
    H.DataStudio.PythonLibrary.editor()
      .findByText(/# You can add functions and classes here/)
      .should("be.visible");

    cy.log("modify and save the python library");
    H.DataStudio.PythonLibrary.editor()
      .findByRole("textbox")
      .click()
      .realType("print('hello world')");

    cy.findByRole("button", { name: "Save" }).should("be.visible").click();

    H.undoToast()
      .findByText(/Python library saved/)
      .should("be.visible");

    cy.log("refresh the page and check the content is persisted");
    cy.reload();

    H.DataStudio.PythonLibrary.editor()
      .findByText(/hello world/)
      .should("be.visible");

    cy.log("replace the library content and save it");
    H.PythonEditor.clear().type(
      dedent`
      def useful_calculation(a, b):
      return a + b
    `,
    );
    H.DataStudio.PythonLibrary.header().findByText("Save").click();
    H.undoToast()
      .findByText(/Python library saved/)
      .should("be.visible");

    cy.log("the contents should be saved properly");
    cy.reload();
    H.PythonEditor.value().should(
      "eq",
      dedent`
      def useful_calculation(a, b):
          return a + b
      `,
    );

    cy.log("reverting the changes should be possible");
    H.PythonEditor.clear().type("# oops");
    H.DataStudio.PythonLibrary.header().findByText("Revert").click();
    H.PythonEditor.value().should(
      "eq",
      dedent`
      def useful_calculation(a, b):
          return a + b
      `,
    );
  });
});
