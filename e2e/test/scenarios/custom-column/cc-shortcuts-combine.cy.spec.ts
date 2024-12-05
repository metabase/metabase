import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("scenarios > question > custom column > expression shortcuts > combine", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to select a combine columns shortcut", () => {
    H.openOrdersTable({ mode: "notebook", limit: 5 });
    H.addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "Total");

    H.expressionEditorWidget().findByText("Total").should("exist");

    selectColumn(1, "Product", "Rating");

    H.expressionEditorWidget().within(() => {
      cy.findByText("Product → Rating").should("exist");

      cy.findByTestId("combine-example").should(
        "have.text",
        "123.45678901234567 123.45678901234567",
      );

      cy.findByText(/Separated by/).click();
      cy.findByLabelText("Separator").type("__");

      cy.findByTestId("combine-example").should(
        "have.text",
        "123.45678901234567__123.45678901234567",
      );

      cy.button("Done").click();

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
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "Total");
    selectColumn(1, "Product", "Rating");

    H.expressionEditorWidget().within(() => {
      // Click the back button, in the header
      cy.findByText("Select columns to combine").click();
    });

    cy.get(".ace_text-input").should("have.value", "\n\n");
    cy.findByTestId("expression-name").should("have.value", "");
  });

  it("should be possible to add and remove more than one column", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "Total");
    selectColumn(1, "Product", "Rating");
    addColumn();
    selectColumn(2, "User", "Email");

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
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "User", "Email");

    H.expressionEditorWidget().within(() => {
      cy.findByText("Separated by (empty)").should("exist");
      cy.findByText(/Separated by/).click();

      cy.findByLabelText("Separator").should("have.value", "");
    });
  });

  it("should be possible to edit a previous stages' columns when there is an aggregation (metabase#43226)", () => {
    H.openOrdersTable({ mode: "notebook" });

    cy.button("Summarize").click();

    H.popover().findByText("Count of rows").click();

    H.addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "User", "Email");

    H.expressionEditorWidget().within(() => {
      cy.findByText("Separated by (empty)").should("exist");
      cy.findByText(/Separated by/).click();

      cy.findByLabelText("Separator").should("have.value", "");
    });
  });
});

H.describeWithSnowplow(
  "scenarios > question > custom column > combine shortcuts",
  () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsNormalUser();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should send an event for combine columns", () => {
      H.openOrdersTable({ mode: "notebook" });
      H.addCustomColumn();
      selectCombineColumns();

      selectColumn(0, "User", "Email");
      selectColumn(1, "User", "Email");

      H.expressionEditorWidget().button("Done").click();

      H.expectGoodSnowplowEvent({
        event: "column_combine_via_shortcut",
        custom_expressions_used: ["concat"],
        database_id: SAMPLE_DB_ID,
        question_id: 0,
      });
    });
  },
);

function selectCombineColumns() {
  cy.findByTestId("expression-suggestions-list").within(() => {
    cy.findByText("Combine columns").click();
  });
}

function selectColumn(index: number, table: string, name?: string) {
  H.expressionEditorWidget().within(() => {
    cy.findAllByTestId("column-input").eq(index).click();
  });

  H.popover()
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
  H.expressionEditorWidget().within(() => {
    cy.findByText("Add column").click();
  });
}
