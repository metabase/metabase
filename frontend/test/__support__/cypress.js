import "@testing-library/cypress/add-commands";

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

export function openOrdersTable() {
  cy.visit("/question/new?database=1&table=2");
}

export function openProductsTable() {
  cy.visit("/question/new?database=1&table=1");
}

Cypress.on("uncaught:exception", (err, runnable) => false);
