import { getInbox, restore, setupSMTP } from "__support__/e2e/helpers";
import { USERS } from "__support__/e2e/cypress_data";

const { admin } = USERS;

describe("scenarios > auth > password", () => {
  beforeEach(() => {
    restore();

    cy.signInAsAdmin();
    setupSMTP();
    cy.signOut();
  });

  it("should reset password via email", () => {
    cy.visit("/auth/forgot_password");

    cy.findByLabelText("Email address").type(admin.email);
    cy.findByText("Send password reset email").click();
    cy.findByText(/Check your email/);

    getInbox().then(({ body: [{ html }] }) => {
      cy.visit(getResetLink(html));

      cy.findByLabelText("Create a password").type(admin.password);
      cy.findByLabelText("Confirm your password").type(admin.password);
      cy.findByText("Save new password").click();

      cy.findByText("You've updated your password.");
    });
  });
});

const getResetLink = html => {
  const [, anchor] = html.match(/<a (.*)>/);
  const [, href] = anchor.match(/href="([^"]+)"/);
  return href;
};
