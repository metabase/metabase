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

// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main/sidebar content area
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
export function sidebar() {
  return cy.get(".scroll-y");
}

// Metabase utility functions for commonly-used patterns

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

  // *** Unnecessary click (Issue #12692)
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

Cypress.on("uncaught:exception", (err, runnable) => false);

export function withSampleDataset(f) {
  cy.request("GET", "/api/database/1/metadata").then(({ body }) => {
    const SAMPLE_DATASET = {};
    for (const table of body.tables) {
      const fields = {};
      for (const field of table.fields) {
        fields[field.name] = field.id;
      }
      SAMPLE_DATASET[table.name] = fields;
      SAMPLE_DATASET[table.name + "_ID"] = table.id;
    }
    f(SAMPLE_DATASET);
  });
}

export function visitAlias(alias) {
  cy.get(alias).then(url => {
    cy.visit(url);
  });
}
