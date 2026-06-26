const { H } = cy;

import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const MCP_ANALYTICS_PATH = "/admin/metabot/usage-auditing/mcp";
const SEED_TOOL_NAME = "e2e_smoke_tool";

type SeedMcpToolCallResponse = { session_id: string; tool_name: string };

function seedMcpToolCall(
  toolName = SEED_TOOL_NAME,
): Cypress.Chainable<Cypress.Response<SeedMcpToolCallResponse>> {
  return cy.request<SeedMcpToolCallResponse>(
    "POST",
    "/api/testing/mcp/seed-tool-call",
    { user_id: ADMIN_USER_ID, tool_name: toolName },
  );
}

function visitMcpAnalyticsPage(): void {
  cy.intercept("GET", "/api/database/13371337/metadata*").as("auditMetadata");
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.visit(MCP_ANALYTICS_PATH);
  cy.wait("@auditMetadata");
}

describe("scenarios > metabot > mcp analytics", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows the audit-app nav item and a seeded tool call on the page", () => {
    H.activateToken("pro-self-hosted");
    seedMcpToolCall();

    visitMcpAnalyticsPage();

    cy.log("Nav item lives under the Auditing folder");
    cy.findByRole("link", { name: "MCP analytics" }).should("be.visible");

    cy.log("The page renders with the seeded data (not the empty state)");
    H.main().within(() => {
      cy.findByRole("heading", { name: "MCP analytics" }).should("be.visible");
      cy.findByText("No MCP activity yet").should("not.exist");
    });

    cy.log("The seeded tool call shows up in the Events table");
    H.main().findByRole("tab", { name: "Tool calls" }).click();
    cy.wait("@dataset");
    H.main().findByText(SEED_TOOL_NAME).should("be.visible");
  });

  it("hides the nav item and the page without the audit-app feature", () => {
    cy.visit(MCP_ANALYTICS_PATH);

    cy.log("The MCP analytics route is not registered without audit_app");
    cy.findByLabelText("error page").should("be.visible");
    cy.findByRole("heading", { name: "MCP analytics" }).should("not.exist");
    cy.findByRole("link", { name: "MCP analytics" }).should("not.exist");
  });
});
