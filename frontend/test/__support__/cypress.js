export const USERS = {
  admin: {
    username: "admin@metabase.com",
    password: "12341234",
  },
  normal: {
    username: "normal@metabase.com",
    password: "12341234",
  },
  nodata: {
    username: "nodata@metabase.com",
    password: "12341234",
  },
  nocollection: {
    username: "nocollection@metabase.com",
    password: "12341234",
  },
};

export function signIn(user = "admin") {
  cy.request("POST", "/api/session", USERS[user]);
}
export function signOut() {
  cy.clearCookie("metabase.SESSION");
}

export function signInAsAdmin() {
  signIn("admin");
}
export function signInAsNormalUser() {
  signIn("normal");
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
