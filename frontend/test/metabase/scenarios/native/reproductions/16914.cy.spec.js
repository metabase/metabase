import {
  restore,
  openNativeEditor,
  runNativeQuery,
} from "__support__/e2e/cypress";

describe("issue 16914", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.signInAsAdmin();
  });

  it("should recover visualization settings after a failed query (metabase#16914)", () => {
    const FAILING_PIECE = " foo";
    const highlightSelectedText = "{shift}{leftarrow}".repeat(
      FAILING_PIECE.length,
    );

    openNativeEditor().type("SELECT 'a' as hidden, 'b' as visible");
    runNativeQuery();

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left")
      .contains(/hidden/i)
      .siblings(".Icon-close")
      .click();
    cy.button("Done").click();

    cy.get("@editor").type(FAILING_PIECE);
    runNativeQuery();

    cy.get("@editor").type(
      "{movetoend}" + highlightSelectedText + "{backspace}",
    );
    runNativeQuery();

    cy.get(".Visualization").within(() => {
      cy.findByText("Every field is hidden right now").should("not.exist");
      cy.findByText("VISIBLE");
      cy.findByText("HIDDEN").should("not.exist");
    });
  });
});
