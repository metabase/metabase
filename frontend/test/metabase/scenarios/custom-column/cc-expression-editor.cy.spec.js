import {
  restore,
  openOrdersTable,
  enterCustomColumnDetails,
} from "__support__/e2e/cypress";

// ExpressionEditorTextfield jsx component
describe("scenarios > question > custom column > expression editor", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // This is the default screen size but we need it explicitly set for this test because of the resize later on
    cy.viewport(1280, 800);

    openOrdersTable({ mode: "notebook" });
    cy.findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "1+1", // Formula was intentionally written without spaces (important for this repro)!
      name: "Math",
    });
    cy.button("Done").should("not.be.disabled");
  });

  it("should not accidentally delete Custom Column formula value and/or Custom Column name (metabase#15734)", () => {
    cy.get(".ace_text-input")
      .first()
      .focus()
      .type("{movetoend}{leftarrow}{movetostart}{rightarrow}{rightarrow}")
      .blur();
    cy.findByDisplayValue("Math");
    cy.button("Done").should("not.be.disabled");
  });

  /**
   * 1. Explanation for `cy.get("@formula").click();`
   *  - Without it, test runner is too fast and the test results in false positive.
   *  - This gives it enough time to update the DOM. The same result can be achieved with `cy.wait(1)`
   */
  it("should not erase Custom column formula and Custom column name when expression is incomplete (metabase#16126)", () => {
    cy.get(".ace_text-input")
      .first()
      .focus()
      .type("{movetoend}{backspace}")
      .blur();
    cy.findByText("Expected expression");
    cy.button("Done").should("be.disabled");
    cy.get("@formula").click(); /* See comment (1) above */
    cy.findByDisplayValue("Math");
  });

  it("should not erase Custom Column formula and Custom Column name on window resize (metabase#16127)", () => {
    cy.viewport(1260, 800);
    cy.get("@formula").click(); /* See comment (1) above */
    cy.findByDisplayValue("Math");
    cy.button("Done").should("not.be.disabled");
  });
});
