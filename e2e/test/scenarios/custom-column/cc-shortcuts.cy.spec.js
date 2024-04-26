import {
  addCustomColumn,
  restore,
  popover,
  openOrdersTable,
  expressionEditorWidget,
} from "e2e/support/helpers";

describe("scenarios > question > custom column > expression shortcuts", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to select a combine columns shortcut", () => {
    openOrdersTable({ mode: "notebook", limit: 5 });
    addCustomColumn();
    selectCombineColumns();

    selectColumn("Total");

    expressionEditorWidget().findByText("Total").should("exist");

    selectColumn("Product", "Rating");

    expressionEditorWidget().within(() => {
      cy.findByText("Product → Rating").should("exist");

      cy.findByTestId("combine-example").should(
        "contain",
        "123.45678901234567 123.45678901234567",
      );

      cy.findByText(/Separated by/).click();
      cy.findByLabelText("Separator").type("__");

      cy.findByTestId("combine-example").should(
        "contain",
        "123.45678901234567__123.45678901234567",
      );

      cy.findByText("Done").click();

      cy.findByTestId("expression-editor-textfield").should(
        "contain",
        'concat([Total], "__", [Product → Rating])',
      );
      cy.findByTestId("expression-name").should(
        "have.value",
        "Combined Total, Rating",
      );
    });
  });

  it("should be possible to cancel when using the combine column shortcut", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    expressionEditorWidget().within(() => {
      cy.findByText("Select columns to combine").click();
    });

    cy.get(".ace_text-input").should("have.value", "\n\n");
    cy.findByTestId("expression-name").should("have.value", "");
  });

  it("should be possible to add and remove more than one column", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    selectColumn("Total");
    selectColumn("Product", "Rating");
    addColumn();
    selectColumn("User", "Email");

    cy.findByTestId("combine-example").should(
      "contain",
      "123.45678901234567 123.45678901234567 email@example.com",
    );

    cy.findAllByLabelText("Remove column").last().click();

    cy.findByTestId("combine-example").should(
      "contain",
      "123.45678901234567 123.45678901234567",
    );
  });

  it("should pick the correct default separator based on the type of the first column", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    selectColumn("User", "Email");

    expressionEditorWidget().within(() => {
      cy.findByText("Separated by (empty)").should("exist");
      cy.findByText(/Separated by/).click();

      cy.findByLabelText("Separator").should("have.value", "");
    });
  });
});

function selectCombineColumns() {
  cy.findByTestId("expression-suggestions-list").within(() => {
    cy.findByText("Combine columns").click();
  });
}

function selectColumn(table, name) {
  expressionEditorWidget().within(() => {
    cy.findAllByText("Select a column...").first().click();
  });

  popover()
    .last()
    .within(() => {
      if (name) {
        // both table and name were given
        cy.findByText(table).click();
        cy.findByText(name).click();
      } else {
        cy.findByText(table).click();
      }
    });
}

function addColumn() {
  expressionEditorWidget().within(() => {
    cy.findByText("Add column").click();
  });
}
