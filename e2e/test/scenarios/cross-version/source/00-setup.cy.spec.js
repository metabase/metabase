import {
  setupLanguage,
  setupInstance,
} from "e2e/test/scenarios/cross-version/helpers/cross-version-helpers.js";

import { version } from "./helpers/cross-version-source-helpers";

describe(`setup on ${version}`, () => {
  it("should set up metabase", () => {
    cy.visit("/");
    // It redirects to the setup page
    cy.location("pathname").should("eq", "/setup");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Welcome to Metabase");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Let's get started").click();

    setupLanguage(version);
    setupInstance(version);

    cy.visit("/admin");
    // Find an element on the admin page so we know we've landed.
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Setup");
  });
});
