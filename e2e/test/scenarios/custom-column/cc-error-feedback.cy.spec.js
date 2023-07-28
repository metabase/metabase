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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should catch non-existent field reference", () => {
    enterCustomColumnDetails({
      formula: "abcdef",
      name: "Non-existent",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^Unknown Field: abcdef/i);
  });

  it("should fail on expression validation errors", () => {
    enterCustomColumnDetails({
      formula: "SUBSTRING('foo', 0, 1)",
      name: "BadSubstring",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/positive integer/i);
  });
});
