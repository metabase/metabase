const { H } = cy;

// Captures the boot-time coverage of a signed-in Metabase session.
// The manifest builder subtracts this baseline from every other spec's
// coverage to strip eager-loaded modules that fire on every page load.
describe("coverage baseline", () => {
  it("signs in and loads the home page", () => {
    H.restore();
    cy.signInAsAdmin();
    cy.visit("/");
    cy.findByTestId("app-bar", { timeout: 30000 }).should("exist");
    cy.findByTestId("home-page", { timeout: 30000 }).should("exist");
  });
});
