import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  addCustomColumn,
  restore,
  popover,
  openOrdersTable,
  expressionEditorWidget,
  describeWithSnowplow,
  expectNoBadSnowplowEvents,
  expectGoodSnowplowEvent,
  resetSnowplow,
} from "e2e/support/helpers";

describe("scenarios > question > custom column > expression shortcuts > combine", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to select a combine columns shortcut", () => {
    openOrdersTable({ mode: "notebook", limit: 5 });
    addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "Total");

    expressionEditorWidget().findByText("Total").should("exist");

    selectColumn(1, "Product", "Rating");

    expressionEditorWidget().within(() => {
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
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "Total");
    selectColumn(1, "Product", "Rating");

    expressionEditorWidget().within(() => {
      // Click the back button, in the header
      cy.findByText("Select columns to combine").click();
    });

    cy.get(".ace_text-input").should("have.value", "\n\n");
    cy.findByTestId("expression-name").should("have.value", "");
  });

  it("should be possible to add and remove more than one column", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
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
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "User", "Email");

    expressionEditorWidget().within(() => {
      cy.findByText("Separated by (empty)").should("exist");
      cy.findByText(/Separated by/).click();

      cy.findByLabelText("Separator").should("have.value", "");
    });
  });

  it("should be possible to edit a previous stages' columns when there is an aggregation (metabase#43226)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.button("Summarize").click();

    popover().findByText("Count of rows").click();

    addCustomColumn();
    selectCombineColumns();

    selectColumn(0, "User", "Email");

    expressionEditorWidget().within(() => {
      cy.findByText("Separated by (empty)").should("exist");
      cy.findByText(/Separated by/).click();

      cy.findByLabelText("Separator").should("have.value", "");
    });
  });
});

describeWithSnowplow(
  "scenarios > question > custom column > combine shortcuts",
  () => {
    beforeEach(() => {
      restore();
      resetSnowplow();
      cy.signInAsNormalUser();
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    it("should send an event for combine columns", () => {
      openOrdersTable({ mode: "notebook" });
      addCustomColumn();
      selectCombineColumns();

      selectColumn(0, "User", "Email");
      selectColumn(1, "User", "Email");

      expressionEditorWidget().button("Done").click();

      expectGoodSnowplowEvent({
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

function selectColumn(index, table, name) {
  expressionEditorWidget().within(() => {
    cy.findAllByTestId("column-input").eq(index).click();
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
