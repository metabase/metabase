import {
  restore,
  signInAsNormalUser,
  popover,
  _typeUsingGet,
  _typeUsingPlaceholder,
} from "../../../__support__/cypress";

function firstCell(contain_assertion, value) {
  cy.get(".TableInteractive-cellWrapper")
    .not(".TableInteractive-headerCellData")
    .first()
    .should(contain_assertion, value);
}

describe("scenarios > question > custom columns", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it.skip("cc should only apply to correct column (Issue #12649)", () => {
    // Create custom question
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();
    cy.get(".Icon-join_left_outer").click();
    cy.findByText("Products").click();
    cy.findByText("Visualize").click();

    cy.wait(1000)
      .findByText("where")
      .should("not.exist");
    cy.findByText("Orders + Products");
    cy.findByText("Product → ID");
    firstCell("contain", 1);
    firstCell("not.contain", 14);

    // Add custom column formula
    cy.get(".Icon-notebook").click();
    cy.findByText("Custom column").click();
    popover().within($popover => {
      cy.get("p")
        .first()
        .click();
      cy.get("[contenteditable='true']")
        .type("1 + 1")
        .click();
      cy.get("input")
        .last()
        .type("X");
      cy.findByText("Done").click();
    });
    cy.findByText("Visualize").click();

    cy.findByText("Visualize").should("not.exist");
    cy.findByText("Product → ID");
    firstCell("contain", 1);
    firstCell("not.contain", 14);
  });

  it("should allow the use of custom column formulas", () => {
    const customFormula = "1 + 1";
    const columnName = "Simple math";

    // go straight to "orders" in custom questions
    cy.visit("/question/new?database=1&table=2&mode=notebook");
    cy.get(".Icon-add_data").click();

    popover().within(() => {
      _typeUsingGet("[contenteditable='true']", customFormula);
      _typeUsingPlaceholder("Something nice and descriptive", columnName);

      cy.findByText("Done").click();
    });

    cy.findByText("Visualize").click();
    // wait for visualization to render (Note: anti-pattern)
    cy.wait(2000);
    cy.findByText(columnName);
  });
});
