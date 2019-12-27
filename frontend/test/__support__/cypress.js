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

export function snapshot(name) {
  cy.request("POST", `/api/util/snapshot/${name}`);
}
export function restore(name) {
  cy.request("POST", `/api/util/restore/${name}`);
}

Cypress.on("uncaught:exception", (err, runnable) => false);
