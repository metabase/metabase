export class AppNavBar {
  signOut = () => {
    cy.findByTestId("app-bar").within(() => {
      cy.findByLabelText("gear icon").click();
    });
    cy.findByText("Sign out").click();
    return this;
  };
}
