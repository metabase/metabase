const { H } = cy;

import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const MCP_ANALYTICS_PATH = "/monitor/ai-auditing/mcp";
const SEED_TOOL_NAME = "e2e_smoke_tool";
const SEED_ERROR_TOOL = "e2e_error_tool";
// error_code -32602 is JSON-RPC "Invalid params", which the view maps to error_type "Invalid params".
const SEED_ERROR_CODE = -32602;
const SEED_ERROR_TYPE = "Invalid params";
const SEED_ERROR_MESSAGE = "missing required argument: query";

type SeedMcpToolCallResponse = { session_id: string; tool_name: string };

type SeedMcpToolCallBody = {
  tool_name?: string;
  status?: string;
  error_code?: number;
  error_message?: string;
};

function seedMcpToolCall(
  body: SeedMcpToolCallBody = {},
): Cypress.Chainable<Cypress.Response<SeedMcpToolCallResponse>> {
  return cy.request<SeedMcpToolCallResponse>(
    "POST",
    "/api/testing/mcp/seed-tool-call",
    { user_id: ADMIN_USER_ID, tool_name: SEED_TOOL_NAME, ...body },
  );
}

function visitMcpAnalyticsPage(): void {
  cy.intercept("GET", "/api/database/13371337/metadata*").as("auditMetadata");
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.visit(MCP_ANALYTICS_PATH);
  cy.wait("@auditMetadata");
}

describe("scenarios > monitor > ai auditing > mcp analytics", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows the audit-app nav item and a seeded tool call on the page", () => {
    H.activateToken("pro-self-hosted");
    seedMcpToolCall();

    visitMcpAnalyticsPage();

    cy.log("Nav item lives in the AI Auditing group");
    cy.findByRole("link", { name: "MCP analytics" }).should("be.visible");

    cy.log("The page renders with the seeded data (not the empty state)");
    H.main().within(() => {
      cy.findByRole("heading", { name: "MCP analytics" }).should("be.visible");
      cy.findByText("No MCP activity").should("not.exist");
    });

    cy.log("The seeded tool call shows up in the Events table");
    H.main().findByRole("tab", { name: "Tool calls" }).click();
    cy.wait("@dataset");
    H.main().findByText(SEED_TOOL_NAME).should("be.visible");
  });

  it("surfaces a failed tool call's error type and message", () => {
    H.activateToken("pro-self-hosted");
    // error_message is gated PII — the backend only records/shows it when retention is on.
    H.updateSetting("analytics-pii-retention-enabled", true);
    seedMcpToolCall({
      tool_name: SEED_ERROR_TOOL,
      status: "error",
      error_code: SEED_ERROR_CODE,
      error_message: SEED_ERROR_MESSAGE,
    });

    visitMcpAnalyticsPage();

    cy.log(
      "The Usage tab surfaces an Errors section once there are failed calls",
    );
    H.main()
      .findByRole("heading", { name: "Errors" })
      .scrollIntoView()
      .should("be.visible");

    cy.log(
      "The Tool calls table shows the derived error type and gated message",
    );
    H.main().findByRole("tab", { name: "Tool calls" }).click();
    cy.wait("@dataset");
    H.main().within(() => {
      cy.findByText(SEED_ERROR_TOOL).scrollIntoView().should("be.visible");
      cy.findByText(SEED_ERROR_TYPE).scrollIntoView().should("be.visible");
      cy.findByText(SEED_ERROR_MESSAGE).scrollIntoView().should("be.visible");
    });
  });

  it("hides the nav item and the page without the audit-app feature", () => {
    cy.visit(MCP_ANALYTICS_PATH);

    cy.log("The MCP analytics route is not registered without audit_app");
    cy.findByLabelText("error page").should("be.visible");
    cy.findByRole("heading", { name: "MCP analytics" }).should("not.exist");
    cy.findByRole("link", { name: "MCP analytics" }).should("not.exist");
  });
});
