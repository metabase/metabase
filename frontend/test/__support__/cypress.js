export function signInAsAdmin() {
  const sessionId = Cypress.env("TEST_FIXTURE_SHARED_ADMIN_LOGIN_SESSION_ID");
  cy.setCookie("metabase.SESSION", sessionId);
}

export function signInAsNormalUser() {
  const sessionId = Cypress.env("TEST_FIXTURE_SHARED_NORMAL_LOGIN_SESSION_ID");
  cy.setCookie("metabase.SESSION", sessionId);
}

export const plainDbHost = Cypress.env("PLAIN_DB_HOST");

// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main content area
export function popover() {
  return cy.get(".PopoverContainer.PopoverContainer--open");
}
export function modal() {
  return cy.get(".ModalContainer");
}
export function nav() {
  return cy.get("nav");
}
export function main() {
  return cy.get("nav").next();
}

Cypress.on("uncaught:exception", (err, runnable) => false);
