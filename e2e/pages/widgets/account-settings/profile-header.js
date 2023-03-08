export class ProfileHeader {
  verifyFullname(value) {
    cy.findByTestId("user-fullname").should("have.text", value);
    return this;
  }

  verifyEmail(value) {
    cy.findByTestId("user-email").should("have.text", value);
    return this;
  }
}
