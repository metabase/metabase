import "@testing-library/cypress/add-commands";

export const ADMIN_CREDS = {
  username: "bob@metabase.com",
  password: "12341234",
};

export const NORMAL_USER_CREDS = {
  username: "robert@metabase.com",
  password: "12341234",
};

export function signInAsAdmin() {
  cy.request("POST", "/api/session", ADMIN_CREDS);
}

export function signInAsNormalUser() {
  cy.request("POST", "/api/session", NORMAL_USER_CREDS);
}

export function signOut() {
  cy.clearCookie("metabase.SESSION");
}

export function snapshot(name) {
  cy.request("POST", `/api/testing/snapshot/${name}`);
}
export function restore(name = "default") {
  cy.request("POST", `/api/testing/restore/${name}`);
}

// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main content area
export function popover() {
  return cy.get(".PopoverBody");
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
