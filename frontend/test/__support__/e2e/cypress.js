import "@testing-library/cypress/add-commands";
import "cypress-real-events/support";
import "@cypress/skip-test/support";
import "@percy/cypress";
import "./commands";

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
export * from "./helpers/e2e-deprecated-helpers";

Cypress.on("uncaught:exception", (err, runnable) => false);
