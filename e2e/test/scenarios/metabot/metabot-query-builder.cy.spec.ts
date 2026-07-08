import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const allOrdersQuestion = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    query: { "source-table": ORDERS_ID },
    type: "query",
  },
  display: "table",
  visualization_settings: {},
};

describe("Metabot Query Builder", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
    cy.intercept("POST", "/api/metabot/agent-streaming").as("agentReq");
  });

  it("should show setup guidance when llm-metabot-configured? is false", () => {
    H.updateSetting("llm-anthropic-api-key", "");
    cy.visit("/question/ask");
    cy.url().should("include", "/question/ask");
    cy.findByRole("button", { name: "connect to a model" }).should(
      "be.visible",
    );
    cy.findByRole("button", { name: "connect to a model" }).click();
    cy.findByTestId("ai-provider-configuration-modal").should("be.visible");
  });

  it("should redirect to notebook when metabot-enabled? is false", () => {
    H.updateSetting("metabot-enabled?", false);

    cy.log(
      "visiting '/question/ask' should redirect to notebook when metabot is disabled",
    );
    cy.visit("/question/ask");
    cy.url().should("include", "/question#");
    cy.findByTestId("metabot-chat").should("not.exist");
  });

  it("should not show AI exploration in new button when metabot is disabled", () => {
    H.updateSetting("metabot-enabled?", false);
    cy.visit("/");

    cy.log("'AI exploration' option should not appear in new button");
    H.newButton().click();
    H.popover().findByText("AI exploration").should("not.exist");
  });

  it("should render the agent's reply inline without leaving the page", () => {
    cy.visit("/question/ask");
    H.metabotChatInput().should("be.visible");

    H.mockMetabotResponse({
      body: mockTextOnlyResponse("Here's what I found."),
    });
    H.sendMetabotMessage("Tell me about my data");

    // the reply renders inline in the full-page conversation...
    cy.wait("@metabotAgent").then(({ request }) => {
      // the full-page conversation uses the nlq profile
      expect(request.body.profile_id).to.equal("nlq");
    });
    H.lastChatMessage().should("have.text", "Here's what I found.");

    // ...and we stay on the /ask page
    cy.url().should("include", "/question/ask");
  });

  it("should render a generated chart inline without leaving the page", () => {
    cy.visit("/question/ask");
    H.metabotChatInput().should("be.visible");

    H.mockMetabotResponse({
      body: mockGeneratedEntityResponse(allOrdersQuestion.dataset_query),
    });
    H.sendMetabotMessage("Show me all orders");

    cy.wait("@metabotAgent");
    // the chart renders inline and we stay on the /ask page
    cy.findByTestId("metabot-inline-chart").should("be.visible");
    cy.findByTestId("qb-header").should("not.exist");
    cy.url().should("include", "/question/ask");
  });

  it("should navigate to a question when the agent returns a navigate_to", () => {
    cy.visit("/");

    // go to new button and click "AI exploration"
    H.newButton("AI exploration").click();
    cy.url().should("include", "/question/ask");
    cy.findByTestId("metabot-chat").should("not.exist");

    const questionHash = H.adhocQuestionHash(allOrdersQuestion);
    H.mockMetabotResponse({
      body: mockNavigateToResponse(`/question#${questionHash}`),
      delay: 100,
    });
    H.sendMetabotMessage("Show me all orders");

    // when we receive a navigate_to, we should be taken to a question
    cy.url().should("include", "/question#");
    cy.findByTestId("qb-header").should("contain", "Orders");
  });

  it("should support clicking suggested prompts", () => {
    // mock suggested prompts
    cy.intercept("GET", "/api/metabot/metabot/*/prompt-suggestions*", {
      prompts: [{ prompt: "Show me all orders" }],
    });

    // visit AI exploration page
    cy.visit("/question/ask");
    H.metabotChatInput().should("be.visible");

    // click suggested prompt
    const questionHash = H.adhocQuestionHash(allOrdersQuestion);
    H.mockMetabotResponse({
      body: mockNavigateToResponse(`/question#${questionHash}`),
    });
    cy.get("main").findByText("Show me all orders").click();

    // should be taken to a question
    cy.wait("@metabotAgent");
    cy.url().should("include", "/question#");
    cy.findByTestId("qb-header").should("contain", "Orders");
  });

  it("should handle errors", () => {
    // visit AI exploration page
    cy.visit("/question/ask");
    H.metabotChatInput().should("be.visible");

    // mock the agent request to stream an error
    H.mockMetabotResponse({ body: mockErrorResponse });

    // send a prompt
    H.sendMetabotMessage("Show me all orders");

    // should show an error message inline
    H.lastChatMessage().should("contain.text", "Something went wrong");
  });
});

// Response helpers
const mockNavigateToResponse = (path: string) =>
  `2:{"type":"navigate_to","version":1,"value":"${path}"}
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;

const mockTextOnlyResponse = (text: string) =>
  `0:"${text}"
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;

const mockGeneratedEntityResponse = (datasetQuery: unknown) => {
  const value = {
    type: "card",
    id: "card-1",
    title: "All orders",
    query: { id: "query-1", query: datasetQuery },
    display: "table",
  };
  return `2:{"type":"generated_entity","version":1,"value":${JSON.stringify(value)}}
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;
};

const mockErrorResponse = `3:"Anthropic API key expired or invalid"
d:{"finishReason":"error","usage":{}}`;
