import { restore, openProductsTable } from "__support__/e2e/cypress";

describe("issue 22361", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should open relative filters for a non-english locale", () => {
    cy.request("PUT", "/api/user/1", { locale: "de" });

    openProductsTable();
    cy.findByText("Created At").click();
    cy.findByText("Nach dieser Spalte filtern").click(); // Filter by this column
    cy.findByText("Relative Datumswerte...").click(); // Relative filters...
    cy.findByText("Füge einen Filter hinzu").should("be.visible"); // Add filter
  });
});
