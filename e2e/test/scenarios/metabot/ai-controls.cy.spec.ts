import {
  ALL_USERS_GROUP_ID,
  NORMAL_USER_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("AI Controls > Metabot access and customization", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("metabot-enabled?", true);
    llmMockServerSetup();
  });

  afterEach(() => {
    llmMockServerTeardown();
  });

  describe("Feature Access page", () => {
    it("should display the AI feature access table with groups and save a permission change", () => {
      cy.intercept("GET", "/api/ee/ai-controls/permissions").as(
        "getPermissions",
      );
      cy.intercept("PUT", "/api/ee/ai-controls/permissions").as(
        "updatePermissions",
      );

      cy.visit("/admin/metabot/1/usage-controls/ai-feature-access");

      cy.wait("@getPermissions");

      cy.findByTestId("ai-feature-access-table").should("be.visible");

      // Verify column headers
      cy.findByTestId("ai-feature-access-table").within(() => {
        cy.findByText("AI features").should("be.visible");
        cy.findByText("Chat and NLQ").should("be.visible");
        cy.findByText("SQL generation").should("be.visible");
        cy.findByText("Other tools").should("be.visible");
      });

      // Admins row should be locked/checked
      cy.findByRole("row", { name: /Administrators permissions/ }).within(
        () => {
          cy.findByRole("switch").should("be.checked").and("be.disabled");
        },
      );

      // All Users row should have the metabot switch checked (default is yes)
      cy.findByRole("row", { name: /All Users permissions/ }).within(() => {
        // Toggle the metabot AI features switch off
        cy.findByRole("switch").should("be.checked").click({ force: true });
      });

      // Wait for the debounced PUT request to complete
      cy.wait("@updatePermissions")
        .its("response.statusCode")
        .should("eq", 200);

      // Verify sub-permission checkboxes are now disabled after disabling metabot
      cy.findByRole("row", { name: /All Users permissions/ }).within(() => {
        cy.findByRole("switch").should("not.be.checked");
        cy.findAllByRole("checkbox").each(($checkbox) => {
          cy.wrap($checkbox).should("be.disabled");
        });
      });
    });
  });

  describe("Group access controls", () => {
    it("should not show the Metabot chat icon for users in a group without Metabot access", () => {
      // First, get the current permissions so we can update only the All Users group
      cy.request("GET", "/api/ee/ai-controls/permissions").then((response) => {
        const currentPermissions: Array<{
          group_id: number;
          perm_type: string;
          perm_value: string;
        }> = response.body.permissions;

        // Set All Users group's metabot permission to "no"
        const updatedPermissions = currentPermissions.map((p) => {
          if (
            p.group_id === ALL_USERS_GROUP_ID &&
            p.perm_type === "permission/metabot"
          ) {
            return { ...p, perm_value: "no" };
          }
          return p;
        });

        cy.request("PUT", "/api/ee/ai-controls/permissions", {
          permissions: updatedPermissions,
        });
      });

      // Sign in as a normal user (who is only in the All Users group)
      cy.signInAsNormalUser();
      cy.visit("/");

      // Wait for the navigation bar to be present
      cy.findByLabelText("Navigation bar").should("be.visible");

      // The Metabot chat icon should not be present
      H.appBar().find('[aria-label*="Chat with"]').should("not.exist");
    });
  });

  describe("Customization", () => {
    it("should save a custom Metabot name", () => {
      cy.intercept("PUT", "/api/setting/metabot-name").as("saveName");

      cy.visit("/admin/metabot/1/customization");

      cy.findByRole("heading", { name: "Customization", level: 1 }).should(
        "be.visible",
      );
      cy.findByLabelText("Metabot's name")
        .should("be.visible")
        .clear()
        .type("HAL 9000");

      // Wait for debounced save
      cy.wait("@saveName").its("response.statusCode").should("eq", 204);

      // Reload and verify persistence
      cy.reload();
      cy.findByLabelText("Metabot's name").should("have.value", "HAL 9000");
    });

    it("should upload a custom Metabot icon and show the illustrations section", () => {
      cy.intercept("PUT", "/api/setting/metabot-icon").as("saveIcon");

      cy.visit("/admin/metabot/1/customization");

      H.main().findByText("Metabot's icon").should("be.visible");
      cy.findByRole("button", { name: "Upload a custom icon" }).should(
        "be.visible",
      );

      // The illustrations section is hidden until a custom icon is set
      H.main().findByText("Metabot illustrations").should("not.exist");

      // Upload a tiny PNG via the hidden file input
      cy.get('input[type="file"]').selectFile(
        {
          contents: Cypress.Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "base64",
          ),
          fileName: "metabot-icon.png",
          mimeType: "image/png",
        },
        { force: true },
      );

      cy.wait("@saveIcon").its("response.statusCode").should("eq", 204);

      // The illustrations section should now appear
      H.main().findByText("Metabot illustrations").should("be.visible");
      cy.findByRole("switch", { name: /Show Metabot illustrations/ })
        .parent()
        .should("be.visible");

      // The "Remove custom icon" button should be visible
      cy.findByLabelText("Remove custom icon").should("be.visible");
    });

    it("should hide Metabot illustrations when the toggle is switched off", () => {
      // Set a custom icon via API so the illustrations toggle is visible
      H.updateEnterpriseSettings({
        "metabot-icon": TINY_PNG_DATA_URI,
        "metabot-show-illustrations": true,
      });
      H.updateSetting("metabot-enabled?", true);

      cy.intercept("PUT", "/api/setting/metabot-show-illustrations").as(
        "saveIllustrations",
      );

      cy.visit("/admin/metabot/1/customization");

      H.main().findByText("Metabot illustrations").should("be.visible");

      // The switch should be ON
      cy.findByRole("switch", { name: "Show Metabot illustrations" }).should(
        "have.attr",
        "data-checked",
        "true",
      );

      // Toggle illustrations off
      cy.findByRole("switch", {
        name: "Show Metabot illustrations",
      }).click({ force: true });

      cy.wait("@saveIllustrations")
        .its("response.statusCode")
        .should("eq", 204);

      // Navigate to the home page and open Metabot chat to verify illustrations are hidden
      cy.visit("/");
      // Can't use H.openMetabotViaSearchButton() because custom icon replaces .Icon-metabot
      H.appBar()
        .findByRole("button", { name: /Chat with/ })
        .click();

      cy.findByTestId("metabot-empty-chat-info").should("be.visible");
      // The SVG illustration should NOT be rendered when showIllustrations=false
      cy.findByTestId("metabot-empty-chat-info")
        .find("svg")
        .should("not.exist");
      // But the hint text should still be visible
      cy.findByTestId("metabot-empty-chat-info")
        .findByText(/I can help you/)
        .should("be.visible");
    });

    it("should show the custom Metabot name in the app bar button tooltip", () => {
      H.updateSetting("metabot-name", "Aria");

      cy.visit("/");
      cy.findByLabelText("Navigation bar").should("be.visible");

      // The app bar button tooltip/aria-label should reflect the custom name
      H.appBar()
        .findByRole("button", { name: /Chat with Aria/ })
        .should("be.visible");
    });

    it("should show a custom Metabot icon in the app bar when metabot-icon is set", () => {
      H.updateEnterpriseSettings({ "metabot-icon": TINY_PNG_DATA_URI });

      cy.visit("/");
      cy.findByLabelText("Navigation bar").should("be.visible");

      // The custom icon img should be rendered (alt = metabot name)
      H.appBar()
        .findByRole("button", { name: /Chat with/ })
        .within(() => {
          // When a custom icon is set, MetabotIcon renders an <img> with alt = metabotName
          cy.get("img").should("be.visible");
        });
    });
  });

  describe("System Prompts pages", () => {
    it("should save a custom Metabot chat system prompt", () => {
      cy.intercept("PUT", "/api/setting/metabot-chat-system-prompt").as(
        "savePrompt",
      );

      cy.visit("/admin/metabot/1/system-prompts/metabot-chat");

      cy.findByRole("heading", {
        name: "Metabot chat prompt instructions",
        level: 1,
      }).should("be.visible");

      cy.findByRole("textbox", { name: /Metabot chat prompt instructions/ })
        .should("be.visible")
        .click()
        .type("Be concise and helpful.");

      cy.wait("@savePrompt").its("response.statusCode").should("eq", 204);

      // Reload and verify persistence
      cy.reload();
      cy.findByRole("textbox", {
        name: /Metabot chat prompt instructions/,
      }).should("contain.value", "Be concise and helpful.");
    });

    it("should save a custom SQL generation system prompt", () => {
      cy.intercept("PUT", "/api/setting/metabot-sql-system-prompt").as(
        "saveSqlPrompt",
      );

      cy.visit("/admin/metabot/1/system-prompts/sql-generation");

      cy.findByRole("heading", {
        name: "SQL generation prompt instructions",
        level: 1,
      }).should("be.visible");

      cy.findByRole("textbox", {
        name: /SQL generation prompt instructions/,
      })
        .should("be.visible")
        .click()
        .type("Always use uppercase SQL keywords.");

      cy.wait("@saveSqlPrompt").its("response.statusCode").should("eq", 204);

      cy.reload();
      cy.findByRole("textbox", {
        name: /SQL generation prompt instructions/,
      }).should("contain.value", "Always use uppercase SQL keywords.");
    });
  });
});

describe("AI controls > AI usage limits", () => {
  const AI_USAGE_LIMITS_URL = "/admin/metabot/1/usage-controls/ai-usage-limits";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    llmMockServerSetup();
  });

  afterEach(() => {
    llmMockServerTeardown();
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

      // Change limit type to messages
      cy.findByRole("radio", { name: "By message count" }).click({
        force: true,
      });
      cy.wait("@saveLimitUnit").then(({ request }) => {
        expect(request.body).to.deep.equal({ value: "messages" });
      });

      // Change reset period to weekly
      cy.findByRole("radio", { name: "Weekly" }).click({ force: true });
      cy.wait("@saveLimitPeriod").then(({ request }) => {
        expect(request.body).to.deep.equal({ value: "weekly" });
      });

      // Type an instance limit value
      cy.findByLabelText(/Total weekly instance limit/).type("500");
      cy.wait("@updateInstanceLimit").then(({ request }) => {
        expect(request.body).to.deep.equal({ max_usage: 500 });
      });

      // Type a quota-reached message
      cy.findByLabelText("Quota-reached message")
        .clear()
        .type("You have hit the AI usage limit.");
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

      cy.findByRole("textbox", {
        name: /Total monthly instance limit/,
      }).clear();
      cy.wait("@updateInstanceLimit").then(({ request }) => {
        expect(request.body).to.deep.equal({ max_usage: null });
      });
    });
  });

  describe("When instance limit is set to 0", () => {
    beforeEach(() => {
      // Enable Metabot with a configured LLM key
      H.updateSetting("metabot-enabled?", true);

      // Set messages as the limit type (easier to trigger with 0)
      // (These settings are added in PR #71699, so we call the API directly)
      cy.request("PUT", "/api/setting/metabot-limit-unit", {
        value: "messages",
      });

      // Set a custom quota-reached message
      cy.request("PUT", "/api/setting/metabot-quota-reached-message", {
        value: DEFAULT_QUOTA_MESSAGE,
      });

      // Set instance limit to 0 — any usage will immediately exceed it
      cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
        max_usage: 0,
      });

      cy.intercept("POST", "/api/metabot/agent-streaming").as("agentReq");
      cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
        "xrayCandidates",
      );

      llmMockServerSetup();
    });

    afterEach(() => {
      llmMockServerTeardown();
    });

    it("should show the quota-reached message when the user sends a message to Metabot", () => {
      cy.visit("/");
      cy.wait("@xrayCandidates");

      H.openMetabotViaSearchButton();
      H.sendMetabotMessage("hello");

      // The backend returns the quota-reached message when limit is exceeded
      H.lastChatMessage().should("have.text", DEFAULT_QUOTA_MESSAGE);
    });
  });

  describe("Group limits handling", () => {
    let groupAId: number;
    let groupBId: number;

    beforeEach(() => {
      cy.request("PUT", "/api/setting/metabot-limit-unit", {
        value: "messages",
      });
      cy.request("PUT", "/api/setting/metabot-quota-reached-message", {
        value: DEFAULT_QUOTA_MESSAGE,
      });

      // Set instance limit high so it doesn't interfere
      cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
        max_usage: 1000,
      });

      // limit-for-user returns NULL (unlimited) when any of the user's groups
      // has no metabot_group_limit row, and returns the MAX across all groups.
      // Set a low limit (1) on every pre-existing group the normal user
      // belongs to so the effective limit equals Group B's 100.
      // Note: the membership API is keyed by user_id, with each entry
      // containing a group_id property.
      cy.request("GET", "/api/permissions/membership").then(({ body }) => {
        const memberships = body[String(NORMAL_USER_ID)] as
          | Array<{ group_id: number }>
          | undefined;
        if (memberships) {
          for (const m of memberships) {
            cy.request("PUT", `/api/ee/ai-controls/usage/group/${m.group_id}`, {
              max_usage: 1,
            });
          }
        }
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
      // Sign back in as admin for cleanup (tests may end signed in as normal user)
      cy.signInAsAdmin();

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
        "Max messages per user for AI Limit Group A (low)",
      ).should("have.value", "5");

      cy.findByLabelText(
        "Max messages per user for AI Limit Group B (high)",
      ).should("have.value", "100");

      // The section description should explain that users get the highest limit
      cy.findByTestId("group-limits-tab").within(() => {
        cy.findByText(
          /If a user belongs to more than one group, they'll be given the highest limit among all the groups/i,
        )
          .scrollIntoView()
          .should("be.visible");
      });
    });

    it("should respect the effective user limit (max across their groups)", () => {
      // Normal user is in group A (limit 5) and group B (limit 100).
      // Effective limit = max(1, 1, 1, 5, 100) = 100.
      // (pre-existing groups are set to 1 in beforeEach)

      // Seed 10 usage rows — below the effective limit of 100
      cy.request("POST", "/api/testing/metabot/seed-ai-usage", {
        user_id: NORMAL_USER_ID,
        count: 10,
      });

      cy.signInAsNormalUser();
      cy.visit("/");
      cy.wait("@xrayCandidates");

      H.openMetabotViaSearchButton();
      H.sendMetabotMessage("hello");

      // With usage (10) < effective limit (100) the backend passes the quota
      // check, calls the mock LLM, and streams its response to the frontend.
      H.lastChatMessage().should("contain.text", MOCK_LLM_RESPONSE);

      // Seed additional rows so total usage (101) exceeds effective group limit (100)
      cy.signInAsAdmin();
      cy.request("POST", "/api/testing/metabot/seed-ai-usage", {
        user_id: NORMAL_USER_ID,
        count: 91,
      });

      cy.signInAsNormalUser();
      cy.visit("/");
      cy.wait("@xrayCandidates");

      H.openMetabotViaSearchButton();
      H.sendMetabotMessage("hello");

      // With usage (101) > effective group limit (100) the backend short-circuits
      // before calling the LLM and returns the quota-reached message.
      H.lastChatMessage().should("have.text", DEFAULT_QUOTA_MESSAGE);
    });
  });
});

describe("AI Controls > Tenant usage limits", () => {
  let tenantId: number;
  let tenantUserId: number;
  const TENANT_USER_EMAIL = "tenant.user@metabase-test.com";
  const TENANT_USER_PASSWORD = "12341234";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("metabot-enabled?", true);

    cy.request("PUT", "/api/setting/metabot-quota-reached-message", {
      value: DEFAULT_QUOTA_MESSAGE,
    });

    // Enable multi-tenancy
    H.updateSetting("use-tenants", true);

    // Create a tenant
    cy.request("POST", "/api/ee/tenant", {
      name: "Test Corp",
      slug: "test-corp",
    }).then(({ body }) => {
      tenantId = body.id;

      // Create a user belonging to that tenant
      cy.request("POST", "/api/user", {
        first_name: "Tenant",
        last_name: "User",
        email: TENANT_USER_EMAIL,
        password: TENANT_USER_PASSWORD,
        tenant_id: tenantId,
      }).then(({ body: user }) => {
        tenantUserId = user.id;
      });
    });

    cy.intercept("POST", "/api/metabot/agent-streaming").as("agentReq");
    cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
      "xrayCandidates",
    );
    cy.intercept("PUT", "/api/ee/ai-controls/usage/tenant/*").as(
      "updateTenantLimit",
    );
    llmMockServerSetup();
  });

  afterEach(() => {
    llmMockServerTeardown();
  });

  it("should allow updating tenant limits when tenants are enabled", () => {
    cy.visit("/admin/metabot/1/usage-controls/ai-usage-limits");

    cy.findByRole("tab", { name: "Specific tenants" }).click();

    cy.findByTestId("tenant-limits-tab").should("be.visible");
    cy.findByTestId("tenant-limits-tab")
      .findByText("Test Corp")
      .should("be.visible");
    cy.findByLabelText(
      "Max total monthly tokens for Test Corp (millions)",
    ).type("10");
    cy.wait("@updateTenantLimit").its("response.statusCode").should("eq", 200);
  });

  it("should show the quota-reached message when the tenant limit is set to 0 and the user sends a message", () => {
    // Set tenant limit to 0 — any usage will immediately exceed it
    cy.request("PUT", `/api/ee/ai-controls/usage/tenant/${tenantId}`, {
      max_usage: 0,
    });
    // Clear the backend limit-check cache so the new limit is seen immediately,
    cy.request("DELETE", "/api/testing/metabot/seed-ai-usage", {
      user_id: tenantUserId,
    });

    // Sign in as the tenant user
    cy.request("POST", "/api/session", {
      username: TENANT_USER_EMAIL,
      password: TENANT_USER_PASSWORD,
    });

    cy.visit("/");
    cy.wait("@xrayCandidates");

    H.openMetabotViaSearchButton();
    H.sendMetabotMessage("hello");

    // The backend returns the quota-reached message when the tenant limit is exceeded
    H.lastChatMessage().should("contain.text", DEFAULT_QUOTA_MESSAGE);
  });

  it("should not show the quota-reached message when no tenant limit is set", () => {
    // No tenant limit is set — the chat input should be available without a quota message
    cy.request("PUT", `/api/ee/ai-controls/usage/tenant/${tenantId}`, {
      max_usage: null,
    });
    // Clear the backend limit-check cache so the new null limit is seen immediately,
    cy.request("DELETE", "/api/testing/metabot/seed-ai-usage", {
      user_id: tenantUserId,
    });

    // Sign in as the tenant user
    cy.request("POST", "/api/session", {
      username: TENANT_USER_EMAIL,
      password: TENANT_USER_PASSWORD,
    });

    cy.visit("/");
    cy.wait("@xrayCandidates");

    H.openMetabotViaSearchButton();
    H.sendMetabotMessage("hello");

    H.lastChatMessage().should("contain.text", MOCK_LLM_RESPONSE);
    H.lastChatMessage().should("not.contain.text", DEFAULT_QUOTA_MESSAGE);
  });
});

// A tiny valid PNG (1×1 transparent pixel) as a data URI, used for icon upload tests
const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const MOCK_LLM_PORT = 6123;
const MOCK_LLM_RESPONSE = "Hello from mock LLM!";
const DEFAULT_QUOTA_MESSAGE =
  "You have reached your AI usage limit for this period. Please try again later, Batman.";

function llmMockServerSetup() {
  // Start a mock server that impersonates the Anthropic Messages API
  // so requests flow through the full backend (including quota checks)
  // without needing a real LLM key.
  cy.task("startMockLlmServer", {
    port: MOCK_LLM_PORT,
    responseText: MOCK_LLM_RESPONSE,
  });

  H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
  H.updateSetting(
    "llm-anthropic-api-base-url",
    `http://localhost:${MOCK_LLM_PORT}`,
  );
}

function llmMockServerTeardown() {
  cy.task("stopMockLlmServer");
}
