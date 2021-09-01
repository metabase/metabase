import { restore, describeWithToken } from "__support__/e2e/cypress";

describeWithToken("scenarios > admin > settings > SSO > JWT", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/admin/settings/authentication/jwt");
  });

  it("should save JWT without an error (metabase#16378)", () => {
    cy.intercept("PUT", "/api/**").as("update");

    cy.findByText("JWT Authentication")
      .closest("li")
      .within(() => {
        cy.findByText("Disabled")
          .siblings("a")
          .click();
      });
    cy.findByText("Enabled");

    cy.findByPlaceholderText("https://jwt.yourdomain.org")
      .type("localhost")
      .blur();
    cy.button("Save changes").click();

    cy.wait("@update");
    cy.button("Changes saved!");

    cy.reload();
    cy.findByText("Enabled");
  });
});
