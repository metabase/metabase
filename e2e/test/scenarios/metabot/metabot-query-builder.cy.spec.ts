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
    H.setupAnthropicLlmProvider();
  });

  it("should render the agent's reply inline and support clicking suggested prompts", () => {
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

    // ...and we move to the conversation's permalink
    cy.url().should("include", "/metabot/conversation/");

    cy.log("suggested prompts");
    // mock suggested prompts
    cy.intercept("GET", "/api/metabot/metabot/*/prompt-suggestions*", {
      prompts: [{ prompt: "Show me all orders" }],
    });

    // visit AI exploration page
    cy.visit("/question/ask");
    H.metabotChatInput().should("be.visible");

    // click suggested prompt
    H.mockMetabotResponse({
      body: mockGeneratedEntityResponse(allOrdersQuestion.dataset_query),
    });
    cy.get("main").findByText("Show me all orders").click();

    // the chart renders inline rather than in the query builder
    cy.wait("@metabotAgent");
    cy.findByTestId("metabot-inline-chart").should("be.visible");
    cy.findByTestId("qb-header").should("not.exist");
    cy.url().should("include", "/metabot/conversation/");

    cy.log("errors");
    H.mockMetabotResponse({ body: mockErrorResponse });
    H.sendMetabotMessage("Show me all orders");
    H.lastChatMessage().should("contain.text", "Something went wrong");
  });
});

// Response helpers
const mockTextOnlyResponse = (text: string) =>
  H.createMetabotSSEBody(H.metabotTextPart(text));

const mockGeneratedEntityResponse = (datasetQuery: unknown) => {
  const value = {
    type: "card",
    id: "card-1",
    title: "All orders",
    query: { id: "query-1", query: datasetQuery },
    display: "table",
  };
  return H.createMetabotSSEBody(H.metabotDataPart("generated_entity", value));
};

const mockErrorResponse = H.createMetabotSSEBody(
  H.metabotErrorPart("Anthropic API key expired or invalid"),
  H.metabotFinishPart("error"),
);
