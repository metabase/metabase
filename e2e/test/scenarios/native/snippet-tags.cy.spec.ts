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
    getSnippetSidebarIcon().click();
    cy.findByTestId("sidebar-content").findByText("Create snippet").click();
    H.modal().within(() => {
      getSnippetContentInput().type("category = {{category}}", {
        parseSpecialCharSequences: false,
      });
      getSnippetNameInput().type("filter-snippet");
      cy.button("Save").click();
    });

    cy.log("assert that the snippet was inserted");
    H.NativeEditor.get().should(
      "contain",
      "select id from products where {{snippet: filter-snippet}}",
    );

    cy.log("assert that the parameter can be used");
    H.filterWidget().findByPlaceholderText("Category").type("Widget");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(54);
  });

  it("should be able to update a snippet and change tags", () => {
    createQuestionAndSnippet().then(({ card }) => {
      H.visitQuestion(card.id);
    });

    cy.log("update the snippet");
    getEditorVisibilityToggler().click();
    getSnippetSidebarIcon().click();
    getEditorSidebar().within(() => {
      cy.icon("chevrondown").click({ force: true });
      cy.button(/Edit/).click();
    });
    H.modal().within(() => {
      getSnippetContentInput()
        .clear()
        .type("ean = {{ean}} or vendor = {{vendor}}", {
          parseSpecialCharSequences: false,
        });
      cy.button("Save").click();
    });

    cy.log("verify that the tags in the query were updated");
    getEditorTopBar().within(() => {
      cy.findByPlaceholderText("Filter").should("not.exist");
      cy.findByPlaceholderText("Ean").type("1018947080336");
      cy.findByPlaceholderText("Vendor").type("Balistreri-Ankunding");
    });
    H.runNativeQuery();
    H.assertTableRowsCount(2);
  });

  it("should be able to change the inner tag type to Number", () => {
    createQuestionAndSnippet({ content: "ID = {{filter}}" }).then(
      ({ card }) => {
        H.visitQuestion(card.id);
      },
    );

    cy.log("change the type");
    getEditorVisibilityToggler().click();
    getVariableSidebarIcon().click();
    getVariableTypeSelect().click();
    H.popover().findByText("Number").click();

    cy.log("verify that the parameter can be used");
    H.filterWidget().findByPlaceholderText("Filter").type("10");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(1);
  });

  it("should be able to change the inner tag type to Field Filter", () => {
    createQuestionAndSnippet({ content: "{{filter}}" }).then(({ card }) => {
      H.visitQuestion(card.id);
    });

    cy.log("change the type");
    getEditorVisibilityToggler().click();
    getVariableSidebarIcon().click();
    getVariableTypeSelect().click();
    H.popover().findByText("Field Filter").click();
    H.popover().findByText("Products").click();
    H.popover().findByText("Category").click();

    cy.log("verify that the parameter can be used");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(53);
  });

  it("should be able to open a question with an old snippet name", () => {
    createQuestionAndSnippet().then(({ card, snippet }) => {
      cy.request("PUT", `/api/native-query-snippet/${snippet.id}`, {
        name: "category-snippet",
      });
      cy.visit(`/question/${card.id}`);
    });

    cy.log("verify that the parameter can be used");
    H.filterWidget().findByPlaceholderText("Filter").type("Widget");
    H.queryBuilderHeader().icon("play").click();
    H.assertQueryBuilderRowCount(54);
  });
});

function getEditorSidebar() {
  return cy.findByTestId("sidebar-right");
}

function getEditorTopBar() {
  return cy.findByTestId("native-query-top-bar");
}

function getEditorVisibilityToggler() {
  return cy.findByTestId("visibility-toggler");
}

function getVariableSidebarIcon() {
  return cy.findByTestId("native-query-editor-action-buttons").icon("variable");
}

function getSnippetSidebarIcon() {
  return cy.findByTestId("native-query-editor-action-buttons").icon("snippet");
}

function getVariableTypeSelect() {
  return cy.findByTestId("variable-type-select");
}

function getSnippetNameInput() {
  return cy.findByLabelText("Give your snippet a name");
}

function getSnippetContentInput() {
  return cy.findByLabelText("Enter some SQL here so you can reuse it later");
}

function createQuestionAndSnippet({
  content = "category = {{filter}}",
}: {
  content?: string;
} = {}) {
  return H.createSnippet({
    name: "filter-snippet",
    content,
  }).then(({ body: snippet }) => {
    return H.createNativeQuestion({
      native: {
        query: "select id from products where {{snippet: filter-snippet}}",
        "template-tags": {
          "snippet: filter-snippet": {
            id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
            name: "snippet: filter-snippet",
            "display-name": "snippet: filter-snippet",
            type: "snippet",
            "snippet-id": snippet.id,
            "snippet-name": snippet.name,
          },
          filter: {
            id: "4b77cc1f-ea70-4ef6-84db-58432fce6929",
            name: "filter",
            "display-name": "Filter",
            type: "text",
          },
        },
      },
    }).then(({ body: card }) => {
      return { card, snippet };
    });
  });
}
