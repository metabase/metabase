export function signInAsAdmin() {
  const sessionId = Cypress.env("TEST_FIXTURE_SHARED_ADMIN_LOGIN_SESSION_ID");
  cy.setCookie("metabase.SESSION", sessionId);
}

export function signInAsNormalUser() {
  const sessionId = Cypress.env("TEST_FIXTURE_SHARED_NORMAL_LOGIN_SESSION_ID");
  cy.setCookie("metabase.SESSION", sessionId);
}

export function signOut() {
  cy.clearCookie("metabase.SESSION");
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

export function popover(callback) {
  const p = cy.get(".PopoverContainer");
  return callback ? callback(p) : p;
}
export function modal(callback) {
  const m = cy.get(".ModalContainer");
  return callback ? callback(m) : m;
}

Cypress.on("uncaught:exception", (err, runnable) => false);
