const { H } = cy;

describe("scenarios > native > snippet tags", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to create a snippet with tags", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select id from products where ");

    cy.log("create a snippet");
    getSnippetIcon().click();
    cy.findByTestId("sidebar-content").findByText("Create snippet").click();
    H.modal().within(() => {
      getContentInput().type("category = {{category}}", {
        parseSpecialCharSequences: false,
      });
      getNameInput().type("filter-snippet");
      cy.button("Save").click();
    });

    cy.log("assert that the snippet was inserted");
    H.NativeEditor.get().should(
      "contain",
      "select id from products where {{snippet: filter-snippet}}",
    );

    cy.log("assert that parameters for inner tags can be used");
    H.filterWidget().findByPlaceholderText("Category").type("Widget");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(54);
  });
});

function getSnippetIcon() {
  return cy.findByTestId("native-query-editor-action-buttons").icon("snippet");
}

function getNameInput() {
  return cy.findByLabelText("Give your snippet a name");
}

function getContentInput() {
  return cy.findByLabelText("Enter some SQL here so you can reuse it later");
}
