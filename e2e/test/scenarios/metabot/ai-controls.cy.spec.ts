import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const AI_USAGE_LIMITS_URL = "/admin/metabot/1/usage-controls/ai-usage-limits";

describe("AI controls > AI usage limits page (EE)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("AI Limits settings can be saved properly", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/ee/ai-controls/usage/instance").as(
        "getInstanceLimit",
      );
      cy.intercept("PUT", "/api/ee/ai-controls/usage/instance").as(
        "updateInstanceLimit",
      );
      cy.intercept("GET", "/api/ee/ai-controls/usage/group").as(
        "getGroupLimits",
      );
      cy.intercept("PUT", "/api/setting/metabot-limit-unit").as(
        "saveLimitUnit",
      );
      cy.intercept("PUT", "/api/setting/metabot-limit-reset-rate").as(
        "saveLimitPeriod",
      );
      cy.intercept("PUT", "/api/setting/metabot-quota-reached-message").as(
        "saveQuotaMessage",
      );
    });

    it("should save limit type, reset period, instance limit, and quota-reached message when changed", () => {
      cy.visit(AI_USAGE_LIMITS_URL);
      cy.wait("@getInstanceLimit");

      // Change limit type to conversations
      cy.findByRole("radio", { name: "By conversation count" }).click({
        force: true,
      });
      cy.wait("@saveLimitUnit").then(({ request }) => {
        expect(request.body).to.deep.equal({ value: "conversations" });
      });

      // Change reset period to weekly
      cy.findByRole("radio", { name: "Weekly" }).click({ force: true });
      cy.wait("@saveLimitPeriod").then(({ request }) => {
        expect(request.body).to.deep.equal({ value: "weekly" });
      });

      // Type an instance limit value
      cy.findByPlaceholderText("Unlimited").type("500");
      cy.wait("@updateInstanceLimit").then(({ request }) => {
        expect(request.body).to.deep.equal({ max_usage: 500 });
      });

      // Type a quota-reached message
      cy.findByLabelText("Quota-reached message").type(
        "You have hit the AI usage limit.",
      );
      cy.wait("@saveQuotaMessage").then(({ request }) => {
        expect(request.body).to.deep.equal({
          value: "You have hit the AI usage limit.",
        });
      });
    });

    it("should save instance limit as null when the field is cleared", () => {
      // Pre-set a limit so there's something to clear
      cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
        max_usage: 100,
      });

      cy.visit(AI_USAGE_LIMITS_URL);
      cy.wait("@getInstanceLimit");

      cy.findByDisplayValue("100").clear();
      cy.wait("@updateInstanceLimit").then(({ request }) => {
        expect(request.body).to.deep.equal({ max_usage: null });
      });
    });
  });

  describe("Metabot shows quota-reached message when instance limit is set to 0", () => {
    const quotaMessage =
      "You have reached your AI usage limit for this period. Please try again later, Batman.";

    beforeEach(() => {
      // Enable Metabot with a configured LLM key
      H.updateSetting("metabot-enabled?", true);
      H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");

      // Set conversations as the limit type (easier to trigger with 0)
      // (These settings are added in PR #71699, so we call the API directly)
      cy.request("PUT", "/api/setting/metabot-limit-unit", {
        value: "conversations",
      });

      // Set a custom quota-reached message
      cy.request("PUT", "/api/setting/metabot-quota-reached-message", {
        value: quotaMessage,
      });

      // Set instance limit to 0 — any usage will immediately exceed it
      cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
        max_usage: 0,
      });

      cy.intercept("POST", "/api/metabot/agent-streaming").as("agentReq");
      cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
        "xrayCandidates",
      );
    });

    afterEach(() => {
      // Clean up instance limit
      cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
        max_usage: null,
      });
    });

    it("should show the quota-reached message when the user sends a message to Metabot", () => {
      cy.visit("/");
      cy.wait("@xrayCandidates");

      H.openMetabotViaSearchButton();
      H.sendMetabotMessage("hello");

      // The backend returns the quota-reached message when limit is exceeded
      H.lastChatMessage().should("have.text", quotaMessage);

      // Ensure no actual LLM call was made (the limit check short-circuits)
      cy.get("@agentReq.all").should("have.length", 1);
    });
  });

  describe("Metabot uses the greatest group limit when a user belongs to multiple groups", () => {
    const quotaMessage =
      "You have reached your AI usage limit for this period. Please try again later, Batman.";
    let groupAId: number;
    let groupBId: number;

    beforeEach(() => {
      H.updateSetting("metabot-enabled?", true);
      H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");

      cy.request("PUT", "/api/setting/metabot-limit-unit", {
        value: "conversations",
      });
      cy.request("PUT", "/api/setting/metabot-quota-reached-message", {
        value: quotaMessage,
      });

      // Set instance limit high so it doesn't interfere
      cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
        max_usage: 1000,
      });

      // Create group A (low limit: 5) and group B (high limit: 100);
      // add the normal user to both
      cy.request("POST", "/api/permissions/group", {
        name: "AI Limit Group A (low)",
      }).then(({ body }) => {
        groupAId = body.id;

        cy.request("PUT", `/api/ee/ai-controls/usage/group/${groupAId}`, {
          max_usage: 5,
        });

        cy.request("POST", "/api/permissions/membership", {
          group_id: groupAId,
          user_id: NORMAL_USER_ID,
        });
      });

      cy.request("POST", "/api/permissions/group", {
        name: "AI Limit Group B (high)",
      }).then(({ body }) => {
        groupBId = body.id;

        cy.request("PUT", `/api/ee/ai-controls/usage/group/${groupBId}`, {
          max_usage: 100,
        });

        cy.request("POST", "/api/permissions/membership", {
          group_id: groupBId,
          user_id: NORMAL_USER_ID,
        });
      });

      cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
        "xrayCandidates",
      );
    });

    afterEach(() => {
      // Clean up seeded usage rows and groups
      cy.request("DELETE", "/api/testing/metabot/seed-ai-usage", {
        user_id: NORMAL_USER_ID,
      });
      cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
        max_usage: null,
      });
      cy.then(() => {
        if (groupAId) {
          cy.request("DELETE", `/api/permissions/group/${groupAId}`);
        }
        if (groupBId) {
          cy.request("DELETE", `/api/permissions/group/${groupBId}`);
        }
      });
    });

    it("should display both groups with their configured limits and note that users get the highest limit", () => {
      cy.visit(AI_USAGE_LIMITS_URL);

      // Both groups should appear in the group limits table with correct values
      cy.findByLabelText(
        "Max conversations per user for AI Limit Group A (low)",
      ).should("have.value", "5");

      cy.findByLabelText(
        "Max conversations per user for AI Limit Group B (high)",
      ).should("have.value", "100");

      // The section description should explain that users get the highest limit
      cy.findByRole("heading", { name: "Group limits" })
        .closest("section, [class*='SettingsSection'], div")
        .within(() => {
          cy.contains(
            /if a user belongs to more than one group.*highest limit/i,
          ).should("be.visible");
        });
    });

    it("should not block a user below the effective limit (max across their groups) but block them once it is exceeded", () => {
      // Normal user is in group A (limit 5) and group B (limit 100).
      // Effective limit = max(5, 100) = 100.

      cy.intercept("POST", "/api/metabot/agent-streaming").as("agentReq");

      // Seed 10 usage rows — below the effective limit of 100
      cy.request("POST", "/api/testing/metabot/seed-ai-usage", {
        user_id: NORMAL_USER_ID,
        count: 10,
      });

      // Mock a successful LLM response; the backend will only reach this if
      // the limit check passes (i.e. usage 10 < effective limit 100)
      H.mockMetabotResponse({
        statusCode: 200,
        body: '0:"Hello! How can I help you?"\nd:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}',
      });

      cy.signInAsNormalUser();
      cy.visit("/");
      cy.wait("@xrayCandidates");

      H.openMetabotViaSearchButton();
      H.sendMetabotMessage("hello");

      // With usage (10) < effective limit (100) the user should NOT be blocked
      H.lastChatMessage().should("have.text", "Hello! How can I help you?");

      // Now seed enough additional rows to exceed the effective limit (100 total)
      cy.signInAsAdmin();
      cy.request("POST", "/api/testing/metabot/seed-ai-usage", {
        user_id: NORMAL_USER_ID,
        count: 90,
      });

      cy.signInAsNormalUser();
      cy.visit("/");
      cy.wait("@xrayCandidates");

      H.openMetabotViaSearchButton();
      H.sendMetabotMessage("hello");

      // With usage (100) >= effective limit (100) the user SHOULD be blocked
      H.lastChatMessage().should("have.text", quotaMessage);
    });
  });
});
