import {
  restore,
  openProductsTable,
  enterCustomColumnDetails,
} from "__support__/e2e/cypress";

describe("scenarios > question > custom column > error feedback", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
  });

  it("should catch mismatched parentheses", () => {
    enterCustomColumnDetails({
      formula: "FLOOR [Price]/2)",
      name: "Massive Discount",
    });

    cy.contains(/^Expecting an opening parenthesis after function FLOOR/i);
  });

  it("should catch missing parentheses", () => {
    enterCustomColumnDetails({
      formula: "LOWER [Vendor]",
      name: "Massive Discount",
    });

    cy.contains(/^Expecting an opening parenthesis after function LOWER/i);
  });

  it("should catch invalid characters", () => {
    enterCustomColumnDetails({
      formula: "[Price] / #",
      name: "Massive Discount",
    });

    cy.contains(/^Invalid character: #/i);
  });

  it("should catch unterminated string literals", () => {
    cy.get("[contenteditable='true']")
      .type('[Category] = "widget')
      .blur();

    cy.findByText("Missing closing quotes");
  });

  it("should catch unterminated field reference", () => {
    enterCustomColumnDetails({
      formula: "[Price / 2",
      name: "Massive Discount",
    });

    cy.contains(/^Missing a closing bracket/i);
  });

  it("should catch non-existent field reference", () => {
    enterCustomColumnDetails({
      formula: "abcdef",
      name: "Non-existent",
    });

    cy.contains(/^Unknown Field: abcdef/i);
  });

  it("should show the correct number of CASE arguments in a custom expression", () => {
    enterCustomColumnDetails({
      formula: "CASE([Price]>0)",
      name: "Sum Divide",
    });

    cy.contains(/^CASE expects 2 arguments or more/i);
  });

  it("should show the correct number of function arguments in a custom expression", () => {
    cy.get("[contenteditable='true']")
      .type("contains([Category])")
      .blur();

    cy.contains(/^Function contains expects 2 arguments/i);
  });
});
