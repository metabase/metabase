import "@testing-library/cypress/add-commands";

export const version = require("../../../version.json");

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

// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main/sidebar content area
export function popover() {
  return cy.get(".PopoverContainer.PopoverContainer--open");
}
export function modal() {
  return cy.get(".ModalContainer .ModalContent");
}
export function nav() {
  return cy.get("nav");
}
export function main() {
  return cy.get("nav").next();
}
export function sidebar() {
  return cy.get(".scroll-y");
}

// Metabase utility functions for commonly-used patterns
export function selectDashboardFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover()
    .contains(filterName)
    .click({ force: true });
}

export function openOrdersTable() {
  cy.visit("/question/new?database=1&table=2");
}

export function openProductsTable() {
  cy.visit("/question/new?database=1&table=1");
}

export function setupLocalHostEmail() {
  // Email info
  cy.findByPlaceholderText("smtp.yourservice.com").type("localhost");
  cy.findByPlaceholderText("587").type("1025");
  cy.findByText("None").click();
  // Leaves password and username blank
  cy.findByPlaceholderText("metabase@yourcompany.com").type("test@local.host");

  // *** Unnecessary click (metabase#12692)
  cy.findByPlaceholderText("smtp.yourservice.com").click();

  cy.findByText("Save changes").click();
  cy.findByText("Changes saved!");

  cy.findByText("Send test email").click();
}

// Find a text field by label text, type it in, then blur the field.
// Commonly used in our Admin section as we auto-save settings.
export function typeAndBlurUsingLabel(label, value) {
  cy.findByLabelText(label)
    .clear()
    .type(value)
    .blur();
}

// Unfortunately, cypress `.type()` is currently broken and requires an ugly "hack"
// it is documented here: https://github.com/cypress-io/cypress/issues/5480
// `_typeUsingGet()` and `_typeUsingPlacehodler()` are temporary solution
// please refrain from using them, unless absolutely neccessary!
export function _typeUsingGet(selector, value, delay = 100) {
  cy.get(selector)
    .click()
    .type(value, { delay })
    .clear()
    .click()
    .type(value, { delay });
}

export function _typeUsingPlaceholder(selector, value, delay = 100) {
  cy.findByPlaceholderText(selector)
    .click()
    .type(value, { delay })
    .clear()
    .click()
    .type(value, { delay });
}

Cypress.on("uncaught:exception", (err, runnable) => false);

export function withDatabase(databaseId, f) {
  cy.request("GET", `/api/database/${databaseId}/metadata`).then(({ body }) => {
    const database = {};
    for (const table of body.tables) {
      const fields = {};
      for (const field of table.fields) {
        fields[field.name] = field.id;
      }
      database[table.name] = fields;
      database[table.name + "_ID"] = table.id;
    }
    f(database);
  });
}

export function withSampleDataset(f) {
  return withDatabase(1, f);
}

export function visitAlias(alias) {
  cy.get(alias).then(url => {
    cy.visit(url);
  });
}

export function createNativeQuestion(name, query) {
  return cy.request("POST", "/api/card", {
    name,
    dataset_query: {
      type: "native",
      native: { query },
      database: 1,
    },
    display: "table",
    visualization_settings: {},
  });
}

export const describeWithToken = Cypress.env("HAS_ENTERPRISE_TOKEN")
  ? describe
  : describe.skip;

// TODO: does this really need to be a global helper function?
export function createBasicAlert({ firstAlert, includeNormal } = {}) {
  cy.get(".Icon-bell").click();
  if (firstAlert) {
    cy.findByText("Set up an alert").click();
  }
  cy.findByText("Let's set up your alert");
  if (includeNormal) {
    cy.findByText("Email alerts to:")
      .parent()
      .children()
      .last()
      .click();
    cy.findByText("Robert Tableton").click();
  }
  cy.findByText("Done").click();
  cy.findByText("Let's set up your alert").should("not.exist");
}
