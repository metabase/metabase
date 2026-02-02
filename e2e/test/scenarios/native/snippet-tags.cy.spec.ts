const { H } = cy;

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > native > snippet tags", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
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

    cy.log("verify that the snippet was inserted");
    H.NativeEditor.get().should(
      "contain",
      "select id from products where {{snippet: variable-snippet}}",
    );

    cy.log("verify that the query can be run");
    getEditorTopBar().findByPlaceholderText("Category").type("Widget");
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

    cy.log("verify that the snippet was inserted");
    H.NativeEditor.get().should(
      "contain",
      "select * from {{snippet: card-snippet}}",
    );

    cy.log("verify that the query can be run");
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

    cy.log("verify that the snippet can used");
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

    cy.log("verify that the query can be run");
    getEditorTopBar().findByPlaceholderText("Filter").type("Widget");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(54);
  });

  it("should be able to use snippets where tags overlap", () => {
    cy.log("create snippets with overlapping tags");
    H.createSnippet({
      name: "snippet1",
      content: "category = {{category1}} or category = {{category2}}",
    });
    H.createSnippet({
      name: "snippet2",
      content: "category = {{category2}}",
    });

    cy.log("use both snippets in a query");
    H.startNewNativeQuestion();
    H.NativeEditor.type(
      "select id from products where {{snippet: snippet1}} or {{snippet: snippet2}}",
    );

    cy.log("verify that the query can be run");
    getEditorTopBar().findByPlaceholderText("Category1").type("Widget");
    getEditorTopBar().findByPlaceholderText("Category2").type("Gadget");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(107);
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
    getEditorTopBar().findByPlaceholderText("Filter").type("10");
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
    getEditorTopBar().findByPlaceholderText("Filter").type("Widget");
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

    cy.log("create a cycle and save the first snippet");
    H.modal().within(() => {
      getSnippetContentInput()
        .clear()
        .type("{{snippet: snippet2}}", { parseSpecialCharSequences: false })
        .click();
      cy.button("Save").click();
    });

    cy.log("run the query and verify that we detect a cycle");
    H.NativeEditor.type("select {{snippet: snippet1}}");
    H.runNativeQuery();
    H.queryBuilderMain()
      .findByText(
        'This query has circular referencing sub-queries. The snippet "snippet2" and the snippet "snippet1" seem to be part of the problem.',
      )
      .should("be.visible");

    cy.log(
      "try to save a question with a snippet cycle and verify we detect it",
    );
    H.queryBuilderHeader().findByText("Save").click();
    H.modal().within(() => {
      cy.findByLabelText("Name").type("SQL");
      cy.button("Save").click();
      cy.findByText("Cannot save card with cycles.").should("be.visible");
      cy.button("Cancel").click();
    });

    cy.log(
      "remove a cycle, save the card, add a cycle again and verify that we detect it on update",
    );
    H.NativeEditor.clear().type("select 1");
    H.saveQuestion("SQL", undefined, {
      path: ["Our analytics"],
    });
    H.NativeEditor.clear().type("select {{snippet: snippet1}}");
    H.queryBuilderHeader().button("Save").click();
    H.modal().within(() => {
      cy.button("Save").click();
      cy.findByText("Cannot save card with cycles.").should("be.visible");
    });
  });

  it("should work for a public or embedded question", () => {
    createQuestionAndSnippet().then(({ card }) => {
      cy.log("public question - no parameter value");
      H.visitPublicQuestion(card.id);
      H.assertTableRowsCount(200);

      cy.log("public question - with parameter value");
      H.filterWidget().findByLabelText("Filter").type("Gadget{enter}");
      H.assertTableRowsCount(53);

      cy.log("embedded question - no parameter value");
      H.visitEmbeddedPage({
        resource: { question: card.id },
        params: {},
      });
      H.assertTableRowsCount(200);

      cy.log("embedded question - with parameter value");
      H.filterWidget().findByLabelText("Filter").type("Gadget{enter}");
      H.assertTableRowsCount(53);
    });
  });

  it("should handle snippet tags with trailing spaces correctly", () => {
    cy.log("create a snippet");
    H.createSnippet({
      name: "category filter",
      content: "category = {{category}}",
    });

    H.startNewNativeQuestion();

    cy.log("type a query with snippet tags containing trailing spaces");
    H.NativeEditor.type(
      "select id from products where {{snippet: category filter }}",
    );

    cy.log("verify snippet reference is recognized");
    getEditorTopBar().within(() => {
      cy.findByPlaceholderText("Category").should("be.visible");
    });

    cy.log("verify the query can be run with the parameter");
    getEditorTopBar().findByPlaceholderText("Category").type("Widget");
    H.runNativeQuery();
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
        query: "select id from products [[where {{snippet: filter-snippet}}]]",
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
      enable_embedding: true,
      embedding_params: {
        filter: "enabled",
      },
    }).then(({ body: card }) => {
      return { card, snippet };
    });
  });
}
