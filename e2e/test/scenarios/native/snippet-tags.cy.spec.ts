import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > native > snippet tags", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to create a snippet with variable tags", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select id from products where ");

    cy.log("create a snippet");
    getEditorTopBar().icon("snippet").click();
    getEditorSidebar().findByText("Create snippet").click();
    H.modal().within(() => {
      getSnippetContentInput().type("category = {{category}}", {
        parseSpecialCharSequences: false,
      });
      getSnippetNameInput().type("variable-snippet");
      cy.button("Save").click();
    });

    cy.log("assert that the snippet was inserted");
    H.NativeEditor.get().should(
      "contain",
      "select id from products where {{snippet: variable-snippet}}",
    );

    cy.log("assert that the parameter can be used");
    H.filterWidget().findByPlaceholderText("Category").type("Widget");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(54);
  });

  it("should be able to create a snippet with card tags", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from ");

    cy.log("create a snippet");
    getEditorTopBar().icon("snippet").click();
    getEditorSidebar().findByText("Create snippet").click();
    H.modal().within(() => {
      getSnippetContentInput().type(`{{#${ORDERS_QUESTION_ID}}}`, {
        parseSpecialCharSequences: false,
      });
      getSnippetNameInput().type("card-snippet");
      cy.button("Save").click();
    });

    cy.log("assert that the snippet was inserted");
    H.NativeEditor.get().should(
      "contain",
      "select * from {{snippet: card-snippet}}",
    );

    cy.log("assert that the query can be run");
    H.runNativeQuery();
    H.tableInteractive().should("be.visible");
  });

  it("should be able to create a snippet with snippet tags", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from ");

    cy.log("create a snippet");
    getEditorTopBar().icon("snippet").click();
    getEditorSidebar().findByText("Create snippet").click();
    H.modal().within(() => {
      getSnippetContentInput().type("category = {{category}}", {
        parseSpecialCharSequences: false,
      });
      getSnippetNameInput().type("snippet1");
      cy.button("Save").click();
    });

    cy.log("create a snippet that uses the previous snippet");
    getEditorTopBar().icon("snippet").click();
    getEditorSidebar().icon("add").click();
    H.popover().findByText("New snippet").click();
    H.modal().within(() => {
      getSnippetContentInput().type("{{snippet: snippet1}}", {
        parseSpecialCharSequences: false,
      });
      getSnippetNameInput().type("snippet2");
      cy.button("Save").click();
    });

    cy.log("assert that the snippet can used");
    H.NativeEditor.clear();
    H.NativeEditor.type("select id from products where {{snippet: snippet2}}");
    getEditorTopBar().findByLabelText("Category").type("Gizmo");
    H.runNativeQuery();
    H.tableInteractive().should("be.visible");
  });

  it("should be able to create a tag with the same name as the inner snippet tag", () => {
    createQuestionAndSnippet().then(({ card }) => {
      H.visitQuestion(card.id);
    });

    cy.log("add a local tag with the same name");
    getEditorVisibilityToggler().click();
    H.NativeEditor.type(" and category = {{filter}}");

    cy.log("assert that the parameter can be used");
    H.filterWidget().findByPlaceholderText("Filter").type("Widget");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(54);
  });

  it("should be able to update a snippet and change tags", () => {
    createQuestionAndSnippet().then(({ card }) => {
      H.visitQuestion(card.id);
    });

    cy.log("update the snippet");
    getEditorVisibilityToggler().click();
    getEditorTopBar().icon("snippet").click();
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
    createQuestionAndSnippet({ snippetContent: "ID = {{filter}}" }).then(
      ({ card }) => {
        H.visitQuestion(card.id);
      },
    );

    cy.log("change the type");
    getEditorVisibilityToggler().click();
    getEditorTopBar().icon("variable").click();
    getVariableTypeSelect().click();
    H.popover().findByText("Number").click();

    cy.log("verify that the parameter can be used");
    H.filterWidget().findByPlaceholderText("Filter").type("10");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(1);
  });

  it("should be able to change the inner tag type to Field Filter", () => {
    createQuestionAndSnippet({ snippetContent: "{{filter}}" }).then(
      ({ card }) => {
        H.visitQuestion(card.id);
      },
    );

    cy.log("change the type");
    getEditorVisibilityToggler().click();
    getEditorTopBar().icon("variable").click();
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

  it("should not be able to create card cycles via snippets", () => {
    cy.log("create a card and a snippet referencing this card");
    H.createNativeQuestion({
      native: {
        query: "select 1",
      },
    }).then(({ body: card }) => {
      H.createSnippet({
        name: "cycle-snippet",
        content: `{{#${card.id}}}`,
      });
      H.visitQuestion(card.id);
    });

    cy.log("create a cycle and try to save the card");
    getEditorVisibilityToggler().click();
    H.NativeEditor.clear();
    H.NativeEditor.type("select * from {{snippet: cycle-snippet}}");
    H.queryBuilderHeader().button("Save").click();
    H.modal().within(() => {
      cy.button("Save").click();
      cy.findByText("Cannot save card with cycles.").should("be.visible");
    });
  });

  it("should not be able to create snippet cycles via snippets", () => {
    cy.log("create two snippets, one using another");
    H.createSnippet({
      name: "snippet1",
      content: "1",
    });
    H.createSnippet({
      name: "snippet2",
      content: "{{snippet: snippet1}}",
    });

    cy.log("open the modal for the first snippet");
    H.startNewNativeQuestion();
    getEditorTopBar().icon("snippet").click();
    getEditorSidebar().within(() => {
      cy.icon("chevrondown")
        .should("have.length", 2)
        .first()
        .click({ force: true });
      cy.button(/Edit/).click();
    });

    cy.log("create a cycle and try to save the snippet");
    H.modal().within(() => {
      getSnippetContentInput()
        .clear()
        .type("{{snippet: snippet2}}", { parseSpecialCharSequences: false })
        .click();
      cy.button("Save").click();
      cy.findByText("Cannot save snippet with cycles.").should("be.visible");
    });
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
  snippetContent = "category = {{filter}}",
}: {
  snippetContent?: string;
} = {}) {
  return H.createSnippet({
    name: "filter-snippet",
    content: snippetContent,
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
