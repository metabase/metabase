import {
  restore,
  mockSessionProperty,
  openNativeEditor,
} from "__support__/e2e/cypress";
import * as SQLFilter from "../helpers/e2e-sql-filter-helpers";
import * as FieldFilter from "../helpers/e2e-field-filter-helpers";

describe("issue 16886", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.signInAsAdmin();

    // Make sure feature flag is on regardles of the environment where this is running.
    mockSessionProperty("field-filter-operators-enabled?", true);
  });

  it("should allow filtering by a hidden column (metabase#16914)", () => {
    openNativeEditor();

    SQLFilter.enterParameterizedQuery(
      "SELECT * FROM products WHERE {{filter}}",
    );

    SQLFilter.openTypePickerFromDefaultFilterType();
    SQLFilter.chooseType("Field Filter");

    FieldFilter.mapTo({
      table: "Products",
      field: "Category",
    });

    SQLFilter.runQuery();

    cy.findByTestId("viz-settings-button").click();
    hideColumn(/category/i);
    cy.button("Done").click();

    SQLFilter.rerunQuery();

    SQLFilter.toggleRequired();
    FieldFilter.openEntryForm({ isFilterRequired: true });
    FieldFilter.addDefaultStringFilter("Gizmo");

    SQLFilter.runQuery();
  });

  it("should keep visualization settings after failed query (metabase#16914)", () => {
    const FAILING_PIECE = " foo";
    const highlightSelectedText = "{shift}{leftarrow}".repeat(
      FAILING_PIECE.length,
    );

    openNativeEditor().type("SELECT 'a' as hidden, 'b' as visible");
    SQLFilter.runQuery();

    cy.findByTestId("viz-settings-button").click();
    hideColumn(/hidden/i);
    cy.button("Done").click();

    cy.get("@editor").type(FAILING_PIECE);
    SQLFilter.runQuery();

    cy.get("@editor").type(
      "{movetoend}" + highlightSelectedText + "{backspace}",
    );
    SQLFilter.runQuery();

    cy.get(".Visualization").within(() => {
      cy.findByText("Every field is hidden right now").should("not.exist");
      cy.findByText("VISIBLE");
      cy.findByText("HIDDEN").should("not.exist");
    });
  });
});

function hideColumn(name) {
  cy.findByTestId("sidebar-left")
    .contains(name)
    .siblings(".Icon-close")
    .click();
}
