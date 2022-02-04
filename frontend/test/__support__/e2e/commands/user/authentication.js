import { USERS } from "__support__/e2e/cypress_data";

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

Cypress.Commands.add("signOut", () => {
  cy.log("Signing out");
  cy.clearCookie("metabase.SESSION");
});
