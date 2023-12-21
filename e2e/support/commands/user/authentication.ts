import { USERS } from "e2e/support/cypress_data";

declare global {
  namespace Cypress {
    interface Chainable {
      signIn: (user?: keyof typeof USERS) => void;
      signInAsAdmin: () => void;
      signInAsNormalUser: () => void;
      signInAsSandboxedUser: () => void;
      signInAsImpersonatedUser: () => void;
      signOut: () => void;
    }
  }
}

Cypress.Commands.add("signIn", (user = "admin") => {
  const { email: username, password } = USERS[user];
  cy.log(`Logging in as ${user}`);
  cy.request("POST", "/api/session", { username, password });
});

Cypress.Commands.add("signInAsAdmin", () => {
  cy.signIn("admin");
});

Cypress.Commands.add("signInAsNormalUser", () => {
  cy.signIn("normal");
});

Cypress.Commands.add("signInAsSandboxedUser", () => {
  cy.signIn("sandboxed");
});

Cypress.Commands.add("signInAsImpersonatedUser", () => {
  cy.signIn("impersonated");
});

Cypress.Commands.add("signOut", () => {
  cy.log("Signing out");
  cy.clearCookie("metabase.SESSION");
});
