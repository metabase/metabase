import "@testing-library/cypress/add-commands";
import "cypress-real-events/support";
import "@cypress/skip-test/support";
import "./commands";

export const version = require("../../../../version.json");

export function snapshot(name) {
  cy.request("POST", `/api/testing/snapshot/${name}`);
}

export function restore(name = "default") {
  cy.log("Restore Data Set");
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

export function browse() {
  // takes you to `/browse` (reflecting changes made in `0.38-collection-redesign)
  return cy.get(".Nav .Icon-table_spaced");
}

// Metabase utility functions for commonly-used patterns
export function selectDashboardFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover()
    .contains(filterName)
    .click({ force: true });
}

export function openTable({ database = 1, table, mode = null } = {}) {
  const url = "/question/new?";
  const params = new URLSearchParams({ database, table });

  if (mode === "notebook") {
    params.append("mode", mode);
  }

  cy.visit(url + params.toString());
}

export function openProductsTable({ mode } = {}) {
  return openTable({ table: 1, mode });
}

export function openOrdersTable({ mode } = {}) {
  return openTable({ table: 2, mode });
}

export function openPeopleTable({ mode } = {}) {
  return openTable({ table: 3, mode });
}

export function openReviewsTable({ mode } = {}) {
  return openTable({ table: 4, mode });
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

Cypress.on("uncaught:exception", (err, runnable) => false);

export function withDatabase(databaseId, f) {
  cy.request("GET", `/api/database/${databaseId}/metadata`).then(({ body }) => {
    const database = {};
    for (const table of body.tables) {
      const fields = {};
      for (const field of table.fields) {
        fields[field.name.toUpperCase()] = field.id;
      }
      database[table.name.toUpperCase()] = fields;
      database[table.name.toUpperCase() + "_ID"] = table.id;
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

export function expectedRouteCalls({ route_alias, calls } = {}) {
  const requestsCount = alias =>
    cy.state("requests").filter(req => req.alias === alias);
  // It is hard and unreliable to assert that something didn't happen in Cypress
  // This solution was the only one that worked out of all others proposed in this SO topic: https://stackoverflow.com/a/59302542/8815185
  cy.get("@" + route_alias).then(() => {
    expect(requestsCount(route_alias)).to.have.length(calls);
  });
}

export function remapDisplayValueToFK({ display_value, name, fk } = {}) {
  // Both display_value and fk are expected to be field IDs
  // You can get them from frontend/test/__support__/e2e/cypress_sample_dataset.json
  cy.request("POST", `/api/field/${display_value}/dimension`, {
    field_id: display_value,
    name,
    human_readable_field_id: fk,
    type: "external",
  });
}

/*****************************************
 **            QA DATABASES             **
 ******************************************/

export function addMongoDatabase(name = "QA Mongo4") {
  // https://hub.docker.com/layers/metabase/qa-databases/mongo-sample-4.0/images/sha256-3f568127248b6c6dba0b114b65dc3b3bf69bf4c804310eb57b4e3de6eda989cf
  addQADatabase("mongo", name, 27017);
}

export function addPostgresDatabase(name = "QA Postgres12") {
  // https://hub.docker.com/layers/metabase/qa-databases/postgres-sample-12/images/sha256-80bbef27dc52552d6dc64b52796ba356d7541e7bba172740336d7b8a64859cf8
  addQADatabase("postgres", name, 5432);
}

export function addMySQLDatabase(name = "QA MySQL8") {
  // https://hub.docker.com/layers/metabase/qa-databases/mysql-sample-8/images/sha256-df67db50379ec59ac3a437b5205871f85ab519ce8d2cdc526e9313354d00f9d4
  addQADatabase("mysql", name, 3306);
}

function addQADatabase(engine, db_display_name, port) {
  const PASS_KEY = engine === "mongo" ? "pass" : "password";
  const AUTH_DB = engine === "mongo" ? "admin" : null;
  const OPTIONS = engine === "mysql" ? "allowPublicKeyRetrieval=true" : null;

  cy.log(`**-- Adding ${engine.toUpperCase()} DB --**`);
  cy.request("POST", "/api/database", {
    engine: engine,
    name: db_display_name,
    details: {
      dbname: "sample",
      host: "localhost",
      port: port,
      user: "metabase",
      [PASS_KEY]: "metasample123", // NOTE: we're inconsistent in where we use `pass` vs `password` as a key
      authdb: AUTH_DB,
      "additional-options": OPTIONS,
      "use-srv": false,
      "tunnel-enabled": false,
    },
    auto_run_queries: true,
    is_full_sync: true,
    schedules: {
      cache_field_values: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: 0,
        schedule_type: "daily",
      },
      metadata_sync: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_type: "hourly",
      },
    },
  }).then(({ status }) => {
    expect(status).to.equal(200);
  });

  // Make sure we have all the metadata because we'll need to use it in tests
  cy.request("POST", "/api/database/2/sync_schema").then(({ status }) => {
    expect(status).to.equal(200);
  });
  cy.request("POST", "/api/database/2/rescan_values").then(({ status }) => {
    expect(status).to.equal(200);
  });
}

export function adhocQuestionHash(question) {
  if (question.display) {
    // without "locking" the display, the QB will run its picking logic and override the setting
    question = Object.assign({}, question, { displayIsLocked: true });
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(question))));
}

export function visitQuestionAdhoc(question) {
  cy.visit("/question#" + adhocQuestionHash(question));
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

function mockProperty(propertyOrObject, value, url) {
  cy.intercept("GET", url, req => {
    req.reply(res => {
      if (typeof propertyOrObject === "object") {
        Object.assign(res.body, propertyOrObject);
      }
      {
        res.body[propertyOrObject] = value;
      }
    });
  });
}

export function mockSessionProperty(propertyOrObject, value) {
  mockProperty(propertyOrObject, value, "/api/session/properties");
}

export function mockCurrentUserProperty(propertyOrObject, value) {
  mockProperty(propertyOrObject, value, "/api/user/current");
}
