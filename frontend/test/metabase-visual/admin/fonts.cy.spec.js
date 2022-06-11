import { restore, describeEE } from "__support__/e2e/cypress";

describeEE("visual tests > admin > fonts", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should reload with new fonts", () => {
    cy.visit("/admin/settings/whitelabel");
    cy.findByText("Font");
    cy.percySnapshot("before-font");
    //Weird way to test that page reloads
    cy.window().then(w => (w.beforeReload = true));
    cy.window().should("have.prop", "beforeReload", true);
    cy.findByTestId("application-font-select-button").click();
    cy.findByText("Roboto Mono").click();

    // Ensure page reloaded
    cy.window().should("not.have.prop", "beforeReload");
    cy.findByText("Font");
    cy.findByText("Roboto Mono");
    cy.percySnapshot("after-font");
  });
});
