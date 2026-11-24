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

  it("shows seeded usage and filters the events by API key", () => {
    H.createApiKey(SEEDED_KEY_NAME, ADMIN_GROUP_ID).then(
      ({ body }: { body: CreateApiKeyResponse }) => {
        seedApiKeyUsage(body.id);
      },
    );
    H.createApiKey(UNUSED_KEY_NAME, ADMIN_GROUP_ID);

    visitApiKeyUsagePage();

    cy.log("The Usage tab renders with the seeded key");
    H.main().findByText(SEEDED_KEY_NAME).should("be.visible");

    cy.log("The Events tab shows the seeded call, attributed to its creator");
    H.main().findByRole("link", { name: "Events" }).click();
    eventsTable().within(() => {
      cy.findByText(SEEDED_KEY_NAME).should("be.visible");
      cy.findByText(ADMIN_DISPLAY_NAME).should("be.visible");
    });

    cy.log("The backend applies the API key filter to the events query");
    selectApiKeyFilter(UNUSED_KEY_NAME);
    eventsTable().findByText("No calls found").should("be.visible");
    selectApiKeyFilter(SEEDED_KEY_NAME);
    eventsTable().findByText(SEEDED_KEY_NAME).should("be.visible");
  });
});
