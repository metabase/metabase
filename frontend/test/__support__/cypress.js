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

export function popover(callback) {
  const p = cy.get(".PopoverContainer");
  return callback ? callback(p) : p;
}
export function modal(callback) {
  const m = cy.get(".ModalContainer");
  return callback ? callback(m) : m;
}

Cypress.on("uncaught:exception", (err, runnable) => false);
