import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("AI Controls > Metabot access", () => {
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
    it("should hide the Metabot chat icon for users in a group without Metabot access, and show it once access is granted", () => {
      cy.intercept("GET", "/api/ee/ai-controls/permissions").as(
        "getPermissions",
      );
      cy.intercept("PUT", "/api/ee/ai-controls/permissions").as(
        "updatePermissions",
      );

      cy.visit("/admin/metabot/usage-controls/ai-feature-access");

      cy.wait("@getPermissions");

      cy.findByRole("row", { name: /All Users permissions/ }).within(() => {
        // Toggle the metabot AI features switch off (default is checked)
        cy.findByRole("switch").should("be.checked").click({ force: true });

        cy.wait("@updatePermissions")
          .its("response.statusCode")
          .should("eq", 200);
      });

      cy.intercept("GET", "/api/metabot/permissions/user-permissions").as(
        "getUserPermissions",
      );

      // Sign in as a normal user (who is only in the All Users group)
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.wait("@getUserPermissions")
        .its("response.body.permissions.metabot")
        .should("eq", "no");

      // Wait for the navigation bar to be present
      cy.findByLabelText("Navigation bar").should("be.visible");

      // The Metabot chat icon should not be present
      H.appBar()
        .findByRole("button", { name: /Chat with/ })
        .should("not.exist");

      cy.signInAsAdmin();
      cy.visit("/admin/metabot/usage-controls/ai-feature-access");
      cy.wait("@getPermissions");

      cy.findByRole("row", { name: /All Users permissions/ }).within(() => {
        // Toggle the metabot AI features switch on again
        cy.findByRole("switch").should("not.be.checked").click({ force: true });

        cy.wait("@updatePermissions")
          .its("response.statusCode")
          .should("eq", 200);
      });

      cy.log(
        "a user in a group with Metabot access sees the Metabot chat icon",
      );
      cy.intercept("GET", "/api/metabot/permissions/user-permissions").as(
        "getNormalUserPermissions",
      );
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.wait("@getNormalUserPermissions")
        .its("response.body.permissions.metabot")
        .should("eq", "yes");
      H.appBar()
        .findByRole("button", { name: /Chat with/ })
        .should("be.visible");
    });
  });
});

describe("AI controls > AI usage limits", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    llmMockServerSetup();
  });

  afterEach(() => {
    llmMockServerTeardown();
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
        // Unjustified type cast. FIXME
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

    cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
      "xrayCandidates",
    );
    llmMockServerSetup();
  });

  afterEach(() => {
    llmMockServerTeardown();
  });

  it("should update tenant limits and apply them to tenant users", () => {
    cy.log("no tenant limit: the user gets an LLM response");
    signInAsTenantUser();

    cy.visit("/");
    cy.wait("@xrayCandidates");

    H.openMetabotViaSearchButton();
    H.sendMetabotMessage("hello");

    H.lastChatMessage().should("contain.text", MOCK_LLM_RESPONSE);
    H.lastChatMessage().should("not.contain.text", DEFAULT_QUOTA_MESSAGE);

    cy.log("tenant limit set to 0: the user gets the quota-reached message");
    cy.signInAsAdmin();
    cy.request("PUT", `/api/ee/ai-controls/usage/tenant/${tenantId}`, {
      max_usage: 0,
    });
    // Clear the backend limit-check cache so the new limit is seen immediately,
    cy.request("DELETE", "/api/testing/metabot/seed-ai-usage", {
      user_id: tenantUserId,
    });

    signInAsTenantUser();

    cy.visit("/");
    cy.wait("@xrayCandidates");

    H.openMetabotViaSearchButton();
    H.sendMetabotMessage("hello");

    // The backend returns the quota-reached message when the tenant limit is exceeded
    H.lastChatMessage().should("contain.text", DEFAULT_QUOTA_MESSAGE);
  });

  function signInAsTenantUser() {
    cy.request("POST", "/api/session", {
      username: TENANT_USER_EMAIL,
      password: TENANT_USER_PASSWORD,
    });
  }
});

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

  H.setupAnthropicLlmProvider({
    baseUrl: `http://localhost:${MOCK_LLM_PORT}`,
  });
}

function llmMockServerTeardown() {
  cy.task("stopMockLlmServer");
}
