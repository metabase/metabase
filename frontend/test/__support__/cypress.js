export function signInAsAdmin() {
  const sessionId = Cypress.env("TEST_FIXTURE_SHARED_ADMIN_LOGIN_SESSION_ID");
  cy.setCookie("metabase.SESSION", sessionId);
}
