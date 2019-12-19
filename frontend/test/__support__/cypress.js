export function signInAsAdmin() {
  const sessionId = Cypress.env("TEST_FIXTURE_SHARED_ADMIN_LOGIN_SESSION_ID");
  cy.setCookie("metabase.SESSION", sessionId);
}

export function signInAsNormalUser() {
  const sessionId = Cypress.env("TEST_FIXTURE_SHARED_NORMAL_LOGIN_SESSION_ID");
  cy.setCookie("metabase.SESSION", sessionId);
}

export const plainDbHost = Cypress.env("PLAIN_DB_HOST");

export function snapshot(name = "snapshot.sql") {
  console.log("snapshot", name);
  cy.request("POST", `/api/util/snapshot/${name}`);
}
export function restore(name = "snapshot.sql") {
  console.log("restore", name);
  cy.request("POST", `/api/util/restore/${name}`);
}

Cypress.on("uncaught:exception", (err, runnable) => false);
