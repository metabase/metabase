const { H } = cy;

import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const API_KEY_USAGE_PATH = "/monitor/api-key-usage";
const ADMIN_GROUP_ID = 2;
const SEEDED_KEY_NAME = "e2e_seeded_key";
const UNUSED_KEY_NAME = "e2e_unused_key";
const ADMIN_DISPLAY_NAME = "Bobby Tables";

type CreateApiKeyResponse = { id: number };

function seedApiKeyUsage(
  apiKeyId: number,
): Cypress.Chainable<Cypress.Response<{ inserted: number }>> {
  return cy.request("POST", "/api/testing/api-keys/seed-usage", {
    api_key_id: apiKeyId,
    user_id: ADMIN_USER_ID,
    created_by_id: ADMIN_USER_ID,
  });
}

function visitApiKeyUsagePage(): void {
  cy.intercept("GET", "/api/database/13371337/metadata*").as("auditMetadata");

  cy.visit(API_KEY_USAGE_PATH);
  cy.wait("@auditMetadata");
}

// The first query against the audit view can take a while to settle locally, so this gates on
// aria-busy clearing (rather than a network alias, which races against the Usage tab's own chart
// queries sharing the same /api/dataset endpoint) before asserting on rendered content.
function eventsTable() {
  cy.findByTestId("api-key-usage-events-table", { timeout: 20000 }).should(
    "have.attr",
    "aria-busy",
    "false",
  );
  return cy.findByTestId("api-key-usage-events-table");
}

function selectApiKeyFilter(label: string): void {
  cy.findByTestId("api-key-usage-filter-select").click();
  H.popover().findByRole("option", { name: label }).click();
}

// The events table has 11 columns and doesn't fit the default viewport.
describe("scenarios > monitor > api key usage", { viewportWidth: 1600 }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("shows seeded usage and lets an admin filter by API key and date", () => {
    H.createApiKey(SEEDED_KEY_NAME, ADMIN_GROUP_ID).then(
      ({ body }: { body: CreateApiKeyResponse }) => {
        seedApiKeyUsage(body.id);
      },
    );
    H.createApiKey(UNUSED_KEY_NAME, ADMIN_GROUP_ID);

    visitApiKeyUsagePage();

    cy.log("The nav item lives directly under Monitor");
    cy.findByRole("link", { name: "API key usage" }).should("be.visible");

    cy.log("The Usage tab renders with the seeded key (not the empty state)");
    H.main().within(() => {
      cy.findByRole("heading", { name: "API key usage" }).should("be.visible");
      cy.findByText("No API key activity").should("not.exist");
      cy.findByText(SEEDED_KEY_NAME).should("be.visible");
    });

    cy.log("The API key filter also scopes the Key activity table");
    selectApiKeyFilter(UNUSED_KEY_NAME);
    H.main().findByText("No API key activity").should("be.visible");
    selectApiKeyFilter("All API keys");
    H.main().findByText(SEEDED_KEY_NAME).should("be.visible");

    cy.log("The Events tab shows the seeded call, attributed to its creator");
    H.main().findByRole("link", { name: "Events" }).click();
    eventsTable().within(() => {
      cy.findByText("Created by").should("be.visible");
      cy.findByText(SEEDED_KEY_NAME).should("be.visible");
      cy.findByText(ADMIN_DISPLAY_NAME).should("be.visible");
    });

    cy.log(
      "There's no separate user filter — the API key filter is the primary way to scope the page",
    );
    cy.findByTestId("conversation-filters-user-select").should("not.exist");

    cy.log("Filtering by the seeded API key keeps the call");
    selectApiKeyFilter(SEEDED_KEY_NAME);
    eventsTable().findByText(SEEDED_KEY_NAME).should("be.visible");

    cy.log("Filtering by an unused API key shows the empty state");
    selectApiKeyFilter(UNUSED_KEY_NAME);
    H.main().findByText("No API key activity").should("be.visible");

    cy.log("Clearing the API key filter restores the call");
    selectApiKeyFilter("All API keys");
    eventsTable().findByText(SEEDED_KEY_NAME).should("be.visible");

    cy.log("Widening the date range still includes the just-seeded call");
    cy.findByTestId("conversation-filters-date-select").click();
    H.popover().findByText("Last 7 days").click();
    eventsTable().findByText(SEEDED_KEY_NAME).should("be.visible");
  });
});
