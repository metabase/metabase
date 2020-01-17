export const USERS = {
  admin: {
    first_name: "Bobby",
    last_name: "Tables",
    username: "admin@metabase.com",
    password: "12341234",
  },
  normal: {
    first_name: "Robert",
    last_name: "Tableton",
    username: "normal@metabase.com",
    password: "12341234",
  },
  nodata: {
    first_name: "No Data",
    last_name: "Tableton",
    username: "nodata@metabase.com",
    password: "12341234",
  },
  nocollection: {
    first_name: "No Collection",
    last_name: "Tableton",
    username: "nocollection@metabase.com",
    password: "12341234",
  },
  none: {
    first_name: "None",
    last_name: "Tableton",
    username: "none@metabase.com",
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
