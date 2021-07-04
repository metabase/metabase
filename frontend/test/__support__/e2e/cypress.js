import "@testing-library/cypress/add-commands";
import "cypress-real-events/support";
import "@cypress/skip-test/support";
import "./commands";
import _ from "underscore";

export const version = require("../../../../version.json");

export * from "./helpers/e2e-setup-helpers";
export * from "./helpers/e2e-ui-elements-helpers";
export * from "./helpers/e2e-dashboard-helpers";
export * from "./helpers/e2e-open-table-helpers";
export * from "./helpers/e2e-database-metadata-helpers";
export * from "./helpers/e2e-qa-databases-helpers";
export * from "./helpers/e2e-ad-hoc-question-helpers";
export * from "./helpers/e2e-enterprise-helpers";
export * from "./helpers/e2e-mock-app-settings-helpers";
export * from "./helpers/e2e-assertion-helpers";
export * from "./helpers/e2e-data-model-helpers";
export * from "./helpers/e2e-misc-helpers";

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

Cypress.on("uncaught:exception", (err, runnable) => false);

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

export function setupDummySMTP() {
  cy.log("Set up dummy SMTP server");
  cy.request("PUT", "/api/setting", {
    "email-smtp-host": "smtp.foo.test",
    "email-smtp-port": "587",
    "email-smtp-security": "none",
    "email-smtp-username": "nevermind",
    "email-smtp-password": "it-is-secret-NOT",
    "email-from-address": "nonexisting@metabase.test",
  });
}

export function getIframeBody(selector = "iframe") {
  return cy
    .get(selector)
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.null")
    .then(cy.wrap);
}

export function generateUsers(count, groupIds) {
  const users = _.range(count).map(index => ({
    first_name: `FirstName ${index}`,
    last_name: `LastName ${index}`,
    email: `user_${index}@metabase.com`,
    password: `secure password ${index}`,
    groupIds,
  }));

  users.forEach(u => cy.createUserFromRawData(u));

  return users;
}

export function enableSharingQuestion(id) {
  cy.request("POST", `/api/card/${id}/public_link`);
}
