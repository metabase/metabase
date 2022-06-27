require("cypress-grep")();

import "@testing-library/cypress/add-commands";
import "cypress-real-events/support";
import "@cypress/skip-test/support";
import "@percy/cypress";
import "./commands";

Cypress.on("uncaught:exception", (err, runnable) => false);
