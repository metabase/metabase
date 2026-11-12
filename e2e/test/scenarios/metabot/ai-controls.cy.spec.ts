const { H } = cy;

const MOCK_LLM_PORT = 6123;
const MOCK_LLM_RESPONSE = "Hello from mock LLM!";
const QUOTA_MESSAGE =
  "You have reached your AI usage limit for this period. Please try again later, Batman.";

// Smoke test for Metabot chat through the real backend: the request reaches
// `POST /api/metabot/agent-streaming` (no cy.intercept stub) and the backend
// calls a mock LLM server. Backend tests cover the limit logic itself.
describe("AI controls > Metabot chat smoke test", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("metabot-enabled?", true);
    H.updateSetting("metabot-quota-reached-message", QUOTA_MESSAGE);

    cy.task("startMockLlmServer", {
      port: MOCK_LLM_PORT,
      responseText: MOCK_LLM_RESPONSE,
    });
    H.setupAnthropicLlmProvider({
      baseUrl: `http://localhost:${MOCK_LLM_PORT}`,
    });

    cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
      "xrayCandidates",
    );
  });

  afterEach(() => {
    cy.task("stopMockLlmServer");
    // H.restore resets the app DB but not the backend's in-memory limit cache.
    // Removing the limit through the API also clears that cache, so a cached
    // "limit reached" result does not leak into later specs.
    cy.signInAsAdmin();
    cy.request("PUT", "/api/ee/ai-controls/usage/instance", {
      max_usage: null,
    });
  });

  it("should reply through the real backend, then show the quota message once the limit is reached", () => {
    cy.signInAsNormalUser();
    cy.visit("/");
    cy.wait("@xrayCandidates");

    H.openMetabotViaSearchButton();
    H.sendMetabotMessage("hello");
    H.lastChatMessage().should("contain.text", MOCK_LLM_RESPONSE);

    cy.log("instance limit set to 0: the backend returns the quota message");
    cy.signInAsAdmin();
    cy.request("PUT", "/api/ee/ai-controls/usage/instance", { max_usage: 0 });

    cy.signInAsNormalUser();
    cy.visit("/");
    cy.wait("@xrayCandidates");

    H.openMetabotViaSearchButton();
    H.sendMetabotMessage("hello");
    H.lastChatMessage().should("have.text", QUOTA_MESSAGE);
  });
});
