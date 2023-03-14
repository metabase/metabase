export class ProfileHeader {
  verifyFullname(value: string) {
    cy.findByTestId("user-fullname").should("have.text", value);
    return this;
  }

  verifyEmail(value: string) {
    cy.findByTestId("user-email").should("have.text", value);
    return this;
  }
}
