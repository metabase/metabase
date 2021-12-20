import { restore, describeWithoutToken } from "__support__/e2e/cypress";

describeWithoutToken("License section", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("it shows an error message when entered token is not correct", () => {
    cy.visit("/admin");
    cy.findByText("License").click();
    cy.findByPlaceholderText("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX").type(
      "invalid_token",
    );
    cy.button("Activate").click();
    cy.findByText(
      "This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.",
    );
  });
});
