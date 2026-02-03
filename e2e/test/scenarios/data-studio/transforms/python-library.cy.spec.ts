const { H } = cy;

describe("scenarios > data studio > transforms > python library", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should allow editing the python library", () => {
    H.DataStudio.Transforms.visit();
    cy.findByRole("link", { name: /Python library/ }).click();

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
    cy.url().reload();

    H.DataStudio.PythonLibrary.editor()
      .findByText(/hello world/)
      .should("be.visible");
  });
});
