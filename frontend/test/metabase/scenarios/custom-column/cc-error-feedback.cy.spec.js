import {
  restore,
  openProductsTable,
  enterCustomColumnDetails,
} from "__support__/e2e/helpers";

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
});
