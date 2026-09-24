const { H } = cy;

// Captures the boot-time coverage of a signed-in session with every premium feature on.
// Tests that activate a token fire premium app-shell code on every page load, so they are compared against this baseline.
describe("coverage baseline with a premium token", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("signs in and loads the home page", () => {
    cy.visit("/");
    cy.findByTestId("app-bar").should("be.visible");
    cy.findByTestId("home-page").should("be.visible");
  });
});
