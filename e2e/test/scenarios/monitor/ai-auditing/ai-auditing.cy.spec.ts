const { H } = cy;

import {
  ADMIN_USER_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";

// The rendering of these pages (charts, tables, empty and error states, the audit_app
// token gate and the PII-gated columns) is covered by Jest. These tests seed AI usage
// through the real recording code and check that the pages read it back from the
// real audit views.

const AUDIT_DB_METADATA = "/api/database/13371337/metadata*";

const SEED_TOOL_NAME = "e2e_smoke_tool";
const SEED_ERROR_TOOL = "e2e_error_tool";
// error_code -32602 is JSON-RPC "Invalid params", which the view maps to error_type "Invalid params".
const SEED_ERROR_CODE = -32602;
const SEED_ERROR_TYPE = "Invalid params";
const SEED_ERROR_MESSAGE = "missing required argument: query";

// must match the title seeded by testing_api/api.clj
const SEEDED_CONVERSATION_TITLE = "E2E usage auditing conversation";

// Each usage-stats chart fires its own adhoc /api/dataset query and mounts ECharts,
// which can take longer than Cypress's default 4s under CI CPU contention.
const CHART_RENDER_TIMEOUT = 12000;

type SeedMcpToolCallBody = {
  tool_name?: string;
  status?: string;
  error_code?: number;
  error_message?: string;
};

function seedMcpToolCall(body: SeedMcpToolCallBody = {}): void {
  cy.request("POST", "/api/testing/mcp/seed-tool-call", {
    user_id: ADMIN_USER_ID,
    tool_name: SEED_TOOL_NAME,
    ...body,
  });
}

function seedUsageAuditingData(): void {
  cy.request("POST", "/api/testing/metabot/seed-usage-auditing", {
    user_id: ADMIN_USER_ID,
    second_user_id: NORMAL_USER_ID,
  });
}

function visitAndWaitForAuditMetadata(path: string): void {
  cy.intercept("GET", AUDIT_DB_METADATA).as("auditMetadata");
  cy.visit(path);
  cy.wait("@auditMetadata");
}

describe("scenarios > monitor > ai auditing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("shows seeded MCP tool calls and their errors", () => {
    seedMcpToolCall();
    // error_message is gated PII: the backend only records it when retention is on.
    H.updateSetting("analytics-pii-retention-enabled", true);
    seedMcpToolCall({
      tool_name: SEED_ERROR_TOOL,
      status: "error",
      error_code: SEED_ERROR_CODE,
      error_message: SEED_ERROR_MESSAGE,
    });

    visitAndWaitForAuditMetadata("/monitor/ai-auditing/mcp");

    H.main()
      .findByRole("heading", { name: "MCP analytics" })
      .should("be.visible");

    cy.log("The Usage tab surfaces an Errors section once a call has failed");
    H.main()
      .findByRole("heading", { name: "Errors" })
      .scrollIntoView()
      .should("be.visible");

    cy.log("The seeded tool calls show up in the Tool calls table");
    cy.intercept("POST", "/api/dataset", (req) => {
      if (req.body?.stages?.[0]?.page) {
        req.alias = "toolCalls";
      }
    });
    H.main().findByRole("tab", { name: "Tool calls" }).click();
    cy.wait("@toolCalls");
    H.main().within(() => {
      cy.findByText(SEED_TOOL_NAME).scrollIntoView().should("be.visible");
      cy.findByText(SEED_ERROR_TOOL).scrollIntoView().should("be.visible");
      cy.findByText(SEED_ERROR_TYPE).scrollIntoView().should("be.visible");
      cy.findByText(SEED_ERROR_MESSAGE).scrollIntoView().should("be.visible");
    });
  });

  it("renders the seeded usage stats and opens a seeded conversation", () => {
    // The Metabot analytics pages show a "Go to AI Settings" empty state unless
    // llm-metabot-configured? is true.
    H.setupAnthropicLlmProvider();
    seedUsageAuditingData();

    visitAndWaitForAuditMetadata("/monitor/ai-auditing/usage");

    H.main()
      .findByRole("heading", { name: "Usage stats" })
      .should("be.visible");

    cy.log("A chart renders from the real audit view");
    H.main()
      .findByText("Conversations by profile")
      .scrollIntoView()
      .should("be.visible")
      .parent()
      .within(() => {
        cy.findByTestId("chart-container", { timeout: CHART_RENDER_TIMEOUT })
          .should("be.visible")
          .find("svg")
          .should("exist");
      });

    cy.log("conversations list and details");
    cy.intercept("GET", "/api/ee/metabot-analytics/conversations?*").as(
      "conversations",
    );
    cy.intercept("GET", "/api/ee/metabot-analytics/conversations/*").as(
      "conversationDetail",
    );
    cy.visit("/monitor/ai-auditing/conversations?date=past7days~");
    cy.wait("@conversations").its("response.statusCode").should("eq", 200);

    cy.contains('[data-testid="conversation"]', "NLQ")
      .scrollIntoView()
      .should("be.visible")
      .realClick();
    cy.wait("@conversationDetail").its("response.statusCode").should("eq", 200);

    H.main().within(() => {
      cy.findByRole("heading", { name: SEEDED_CONVERSATION_TITLE }).should(
        "be.visible",
      );
      cy.findByText("NLQ").should("be.visible");
      ["Input tokens", "Output tokens", "Cached input tokens"].forEach(
        (label) => cy.findByText(label).should("be.visible"),
      );
    });
  });
});
