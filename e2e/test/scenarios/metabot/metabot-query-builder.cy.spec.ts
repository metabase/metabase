import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const metabotPromptInput = () => cy.get(".ProseMirror[contenteditable=true]");

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
  describe("OSS", { tags: "@OSS" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should not be available in OSS", () => {
      cy.visit("/");

      // "AI exploration" option should not appear in new button
      H.newButton().click();
      H.popover().findByText("AI exploration").should("not.exist");

      // visiting /question/ask should redirect to an empty notebook query
      cy.visit("/question/ask");
      cy.url().should("include", "/question#");
    });
  });

  describe("EE", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      cy.intercept("POST", "/api/ee/metabot-v3/native-agent-streaming").as(
        "agentReq",
      );
    });

    it("should be able to successfully generate a notebook query", () => {
      // visit home page
      cy.visit("/");

      // go to new button and click "AI exploration"
      H.newButton("AI exploration").click();

      // should show page
      cy.url().should("include", "/question/ask");
      cy.findByTestId("metabot-send-message").should("be.visible");

      // should have disabled send button
      cy.findByTestId("metabot-send-message").should("be.disabled");

      // should be able to type into the input
      metabotPromptInput().type("Show me all orders");

      // should be able to send prompt
      const questionHash = H.adhocQuestionHash(allOrdersQuestion);
      H.mockMetabotResponse({
        body: mockNavigateToResponse(`/question#${questionHash}`),
        delay: 100,
      });
      cy.findByTestId("metabot-send-message").click();

      // should see loading state, send button should be disabled
      cy.findByTestId("metabot-send-message").should("be.disabled");
      cy.findByTestId("metabot-send-message").should(
        "have.attr",
        "data-loading",
        "true",
      );

      // request body should include nlq profile
      cy.wait("@metabotAgent").then(({ request }) => {
        expect(request.body.profile_id).to.eq("nlq");
      });

      // when we receive a navigate_to, we should be taken to a question
      cy.url().should("include", "/question#");
      cy.findByTestId("qb-header").should("contain", "Orders");
    });

    it("should support clicking suggested prompts", () => {
      // mock suggested prompts
      cy.intercept("GET", "/api/ee/metabot-v3/metabot/*/prompt-suggestions*", {
        prompts: [{ prompt: "Show me all orders" }],
      });

      // visit AI exploration page
      cy.visit("/question/ask");
      cy.findByTestId("metabot-send-message").should("be.visible");

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
      cy.findByTestId("metabot-send-message").should("be.visible");

      // mock the agent request to fail
      H.mockMetabotResponse({ statusCode: 500 });

      // send a prompt
      metabotPromptInput().type("Show me all orders");
      cy.findByTestId("metabot-send-message").click();

      // should show error
      cy.get("main")
        .findByText("Something went wrong. Please try again.")
        .should("be.visible");
    });

    it("should handle getting no navigate_to", () => {
      // visit AI exploration page
      cy.visit("/question/ask");
      cy.findByTestId("metabot-send-message").should("be.visible");

      // mock a response without a navigate_to data part
      H.mockMetabotResponse({
        body: mockTextOnlyResponse("I need more information to help you."),
      });

      // send a prompt
      metabotPromptInput().type("Show me something");
      cy.findByTestId("metabot-send-message").click();
      cy.wait("@metabotAgent");

      // should be taken to /question/notebook with the sidebar open
      cy.url().should("include", "/question/notebook");
      H.assertChatVisibility("visible");
    });

    it("should cancel requests if the user leaves the page", () => {
      // visit AI exploration page
      cy.visit("/question/ask");
      cy.findByTestId("metabot-send-message").should("be.visible");

      // send a prompt with a delayed response
      H.mockMetabotResponse({
        body: mockTextOnlyResponse("This should be canceled"),
        delay: 2000,
      });
      metabotPromptInput().type("Show me something");
      cy.findByTestId("metabot-send-message").click();

      // click on the logo in the app bar to leave the page
      cy.findByTestId("main-logo-link").click();

      // check that the agent request was canceled
      cy.get("@metabotAgent").its("state").should("eq", "Errored");
    });
  });
});

// Response helpers
const mockNavigateToResponse = (path: string) =>
  `2:{"type":"navigate_to","version":1,"value":"${path}"}
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;

const mockTextOnlyResponse = (text: string) =>
  `0:"${text}"
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;
