import {
  restore,
  openProductsTable,
  enterCustomColumnDetails,
} from "e2e/support/helpers";

describe("scenarios > question > custom column > error feedback", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
  });

  it("should catch non-existent field reference", () => {
    enterCustomColumnDetails({
      formula: "abcdef",
      name: "Non-existent",
    });

    cy.contains(/^Unknown Field: abcdef/i);
  });

  it("should fail on expression validation errors", () => {
    enterCustomColumnDetails({
      formula: "SUBSTRING('foo', 0, 1)",
      name: "BadSubstring",
    });

    cy.contains(/positive integer/i);
  });
});
