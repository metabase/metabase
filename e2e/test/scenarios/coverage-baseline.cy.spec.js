const { H } = cy;

// Captures the boot-time coverage of a signed-in Metabase session.
// The manifest builder subtracts this baseline from every other spec's
// coverage to strip eager-loaded modules that fire on every page load.
describe("coverage baseline", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("signs in and loads the home page", () => {
    cy.visit("/");
    cy.findByTestId("app-bar").should("be.visible");
    cy.findByTestId("home-page").should("be.visible");
  });
});
