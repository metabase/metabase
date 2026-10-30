const { H } = cy;

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

// HACK which lets us type (even very long words) without losing focus
// this is needed for fields where autocomplete suggestions are enabled
function clearAndIterativelyTypeUsingLabel(label: string, value: string) {
  cy.findByLabelText(label).click().clear();

  for (const char of value) {
    cy.findByLabelText(label).type(char);
  }
}

describe("scenarios > native > snippets", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should let a normal user create, use, preview and edit a snippet (metabase#21581)", () => {
    cy.signInAsNormalUser();

    cy.log("Type a query and highlight some of the text");
    H.startNewNativeQuestion();
    H.NativeEditor.type("select 'stuff'");

    for (let i = 0; i < "'stuff'".length; i++) {
      cy.realPress(["Shift", "ArrowLeft"]);
    }

    cy.log("Add a snippet of that text");
    cy.findByTestId("native-query-editor-action-buttons")
      .icon("snippet")
      .click();
    cy.findByTestId("sidebar-content").findByText("Create snippet").click();

    H.modal().within(() => {
      cy.findByLabelText("Give your snippet a name").type("stuff-snippet");
      cy.button("Save").click();
    });

    cy.log("SQL editor should get updated automatically");
    H.NativeEditor.get().should("contain", "select {{snippet: stuff-snippet}}");

    cy.log("Run the query and check the value");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.findByTestId("scalar-value").should("have.text", "stuff");

    cy.log("Preview the query with the snippet expanded (metabase#60534)");
    cy.findByTestId("native-query-top-bar")
      .findByLabelText("Preview the query")
      .click();
    H.modal().within(() => {
      H.codeMirrorValue().should("eq", "select\n  'stuff'");
    });
    cy.realPress("Escape");
    H.modal().should("not.exist");

    cy.log(
      "A short snippet preview should not show scrollbars (metabase#21550)",
    );
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("stuff-snippet").realHover();
      cy.icon("chevrondown").click({ force: true });
      cy.get("pre").should(($pre) => {
        expect($pre).to.contain("'stuff'");
        const preWidth = $pre[0].getBoundingClientRect().width;
        const clientWidth = $pre[0].clientWidth;
        const BORDERS = 2; // 1px left and right
        expect(clientWidth).to.be.gte(preWidth - BORDERS);
      });
    });

    cy.log("Edit the snippet");
    H.rightSidebar()
      .findByRole("button", { name: /pencil icon edit/i })
      .click();

    H.modal().within(() => {
      cy.findByText("Editing stuff-snippet");

      clearAndIterativelyTypeUsingLabel(
        "Enter some SQL here so you can reuse it later",
        "1+1",
      );
      clearAndIterativelyTypeUsingLabel("Give your snippet a name", "Math");

      cy.button("Save").click();
    });

    cy.log("SQL editor should get updated automatically");
    H.NativeEditor.get().should("contain", "select {{snippet: Math}}");

    cy.log("Run the query and check the new value");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.findByTestId("scalar-value").should("have.text", "2");
  });

  it("should let you create a snippet folder and move a snippet into it (metabase#17268, metabase#44930)", () => {
    H.createSnippet({ name: "snippet 1", content: "snippet 1" });

    H.startNewNativeQuestion();
    cy.icon("snippet").click();

    cy.log("All Users can curate root snippets by default (metabase#17268)");
    H.rightSidebar()
      .findByTestId("snippet-header-buttons")
      .icon("ellipsis")
      .click();
    H.popover().findByText("Change permissions").click();
    H.modal().within(() => {
      cy.findByText("All Users")
        .closest("tr")
        .findByTestId("permissions-select")
        .should("contain", "Curate");
      cy.button("Cancel").click();
    });
    H.modal().should("not.exist");

    cy.log("Create a folder");
    H.rightSidebar().icon("add").click();
    H.popover().findByText("New folder").click();
    H.modal().within(() => {
      cy.findByText("New collection");
      cy.findByLabelText("Name").type("my favorite snippets");
      cy.button("Create").click();
    });
    H.modal().should("not.exist");

    cy.log("A folder cannot be moved into itself (metabase#44930)");
    H.rightSidebar()
      .findByText("my favorite snippets")
      .parent()
      .findByRole("button", { name: "Snippet folder options" })
      .click({ force: true });
    H.popover().findByText("Edit folder details").click();
    H.modal().findByTestId("collection-picker-button").click();
    H.entityPickerModalItem(1, /my favorite snippets/).should(
      "have.attr",
      "data-disabled",
      "true",
    );
    H.entityPickerModal().button("Cancel").click();
    H.modal().button("Cancel").click();
    H.modal().should("not.exist");

    cy.log("Move the snippet into the folder");
    H.rightSidebar()
      .findByText("snippet 1")
      .parent()
      .parent()
      .parent()
      .within(() => {
        cy.icon("chevrondown").click({ force: true });
      });
    H.rightSidebar().findByText("Edit").click();

    H.modal().findByText("SQL snippets").click();
    H.entityPickerModal().within(() => {
      cy.findByText("my favorite snippets").click();
      cy.findByText("Select").click();
    });
    cy.intercept("/api/collection/root/items?namespace=snippets").as(
      "updateList",
    );
    H.modal().button("Save").click();
    cy.wait("@updateList");

    H.rightSidebar().within(() => {
      cy.findAllByText("snippet 1").should("have.length", 0);
      cy.findByText("my favorite snippets").click();
      // The list re-renders while the move's refetch settles; assert on the settled
      // count so a transient duplicate/empty frame doesn't hard-fail `findByText`.
      cy.findAllByText("snippet 1").should("have.length", 1);
    });

    cy.log("Move the snippet into a folder created in the collection picker");
    H.rightSidebar().within(() => {
      cy.findByText("snippet 1").parent().parent().click();
      cy.button(/Edit/).click();
    });

    H.modal().findByTestId("collection-picker-button").click();
    H.entityPickerModal()
      .findByRole("button", { name: /New folder/ })
      .click();
    H.collectionOnTheGoModal()
      .findByLabelText("Give it a name")
      .type("my special snippets");
    H.collectionOnTheGoModal().findByRole("button", { name: "Create" }).click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();
    H.modal().findByRole("button", { name: "Save" }).click();

    H.rightSidebar().within(() => {
      cy.findAllByText("snippet 1").should("have.length", 0);
      cy.findByText("my special snippets").click();
      cy.findAllByText("snippet 1").should("have.length", 1);
    });
  });

  it("should run queries with tags from snippets", () => {
    H.createSnippet({
      name: "category-filter",
      content: "category = {{category}}",
    });
    H.createSnippet({
      name: "nested-filter",
      content: "{{snippet: category-filter}}",
    });
    H.createSnippet({
      name: "orders-card",
      content: `{{#${ORDERS_QUESTION_ID}}}`,
    });
    H.createSnippet({ name: "field-filter", content: "{{filter}}" });

    H.startNewNativeQuestion();

    cy.log("A variable from a nested snippet");
    H.NativeEditor.type(
      "select id from products where {{snippet: nested-filter}}",
    );
    cy.findByTestId("native-query-top-bar")
      .findByPlaceholderText("Category")
      .type("Gizmo");
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(51);

    cy.log("A card reference from a snippet");
    H.NativeEditor.clear();
    H.NativeEditor.type("select count(*) from {{snippet: orders-card}}");
    H.runNativeQuery();
    cy.findByTestId("scalar-value").should("have.text", "18,760");

    cy.log("A snippet variable changed to a field filter");
    H.NativeEditor.clear();
    H.NativeEditor.type(
      "select id from products where {{snippet: field-filter}}",
    );
    cy.findByTestId("native-query-top-bar").icon("variable").click();
    cy.findByTestId("variable-type-select").click();
    H.popover().findByText("Field Filter").click();
    H.popover().findByText("Products").click();
    H.popover().findByText("Category").click();
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.runNativeQuery();
    H.assertQueryBuilderRowCount(53);
  });
});
