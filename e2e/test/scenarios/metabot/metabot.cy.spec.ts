import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const loremIpsum =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer auctor id erat non sollicitudin. ";

describe("Metabot UI", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.setupAnthropicLlmProvider();
    cy.intercept("POST", "/api/metabot/agent-streaming").as("agentReq");
    cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
      "xrayCandidates",
    );
  });

  describe("scroll management", () => {
    beforeEach(() => {
      cy.visit("/");
      cy.wait("@xrayCandidates");
    });

    it("should size the filler element and manage the scroll position as messages are added", () => {
      H.openMetabotViaSearchButton();
      cy.findByTestId("metabot-empty-chat-info").should("be.visible");
      H.chatMessages().should("not.exist");
      cy.findByTestId("metabot-message-filler").should("not.exist");

      cy.log(
        "if the messages aren't scrollable, the filler takes the remaining space",
      );
      H.mockMetabotResponse({
        statusCode: 200,
        body: whoIsYourFavoriteResponse,
      });
      H.sendMetabotMessage("Who is your favorite?");
      H.lastChatMessage().should("have.text", "You, but don't tell anyone.");
      assertFillerReachesContainerBottom();

      cy.log("test on message shorter than prompt");
      H.mockMetabotResponse({
        statusCode: 200,
        body: H.createMetabotSSEBody(H.metabotTextPart(loremIpsum.repeat(5))),
      });
      H.sendMetabotMessage("You really mean that?");
      H.lastChatMessage().should("contain.text", "Lorem ipsum");

      cy.log("scroll new prompt to top of the scroll area");
      assertLastPromptAtContainerTop();

      cy.log(
        "if the response is shorter than the scroll area, filler should have height",
      );
      cy.findByTestId("metabot-message-filler").should(($el) => {
        expect($el[0].clientHeight).to.be.greaterThan(0);
      });

      H.mockMetabotResponse({
        statusCode: 200,
        body: H.createMetabotSSEBody(H.metabotTextPart(loremIpsum.repeat(50))),
      });
      H.sendMetabotMessage("Keep going...");

      cy.log(
        "if the response is longer than the scroll area the filler height should be zero",
      );
      cy.findByTestId("metabot-message-filler").should(($el) => {
        expect($el[0].clientHeight).to.equal(0);
      });
      assertLastPromptAtContainerTop();

      cy.log(
        "open metabot to the bottom of the conversation when reopened with message history",
      );
      H.closeMetabotViaCloseButton();
      H.openMetabotViaSearchButton();
      cy.findByTestId("metabot-chat-messages").should(($el) => {
        const el = $el[0];
        expect(el.scrollHeight).to.be.greaterThan(el.clientHeight);
        expect(el.scrollTop + el.clientHeight).to.be.closeTo(
          el.scrollHeight,
          1,
        );
      });
    });
  });

  describe("metabot events", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("Metabot chat", () => {
      beforeEach(() => {
        cy.visit("/");
        cy.wait("@xrayCandidates");
      });

      it("should be controlled via keyboard shortcut, be able to be opened and closed, send a message to the agent, handle successful or failed responses, and start a new conversation via /metabot/new", () => {
        H.openMetabotViaShortcutKey();
        H.expectUnstructuredSnowplowEvent({
          event: "metabot_chat_opened",
          triggered_from: "keyboard_shortcut",
        });
        H.closeMetabotViaShortcutKey();
        cy.log("We don't track closing the chat via kbd");
        H.expectUnstructuredSnowplowEvent(
          {
            event: "metabot_chat_opened",
            triggered_from: "keyboard_shortcut",
          },
          1,
        );

        H.openMetabotViaSearchButton();
        H.expectUnstructuredSnowplowEvent({
          event: "metabot_chat_opened",
          triggered_from: "header",
        });
        H.expectUnstructuredSnowplowEvent(
          {
            event: "metabot_chat_opened",
            triggered_from: "keyboard_shortcut",
          },
          1,
        );
        H.closeMetabotViaCloseButton();

        cy.log("send a message and handle successful or failed responses");
        H.openMetabotViaSearchButton();
        H.chatMessages().should("not.exist");

        H.mockMetabotResponse({
          statusCode: 200,
          body: whoIsYourFavoriteResponse,
        });
        H.sendMetabotMessage("Who is your favorite?");
        H.expectUnstructuredSnowplowEvent({
          event: "metabot_request_sent",
        });

        H.lastChatMessage().should("have.text", "You, but don't tell anyone.");

        H.mockMetabotResponse({ statusCode: 200, body: apiKeyInvalidResponse });
        H.sendMetabotMessage("Who is your favorite?");
        H.lastChatMessage().should("contain.text", "Something went wrong");

        cy.log("start a new conversation via /metabot/new");
        H.mockMetabotResponse({
          statusCode: 200,
          body: whoIsYourFavoriteResponse,
        });
        cy.visit("/metabot/new?q=Who%20is%20your%20favorite%3F");
        H.assertChatVisibility("visible");
        H.lastChatMessage().should("have.text", "You, but don't tell anyone.");
      });
    });

    it("should not submit a prompt via /metabot/new and redirect /question/ask to the notebook when metabot is disabled", () => {
      H.updateSetting("metabot-enabled?", false);
      cy.visit("/metabot/new?q=Who%20is%20your%20favorite%3F");
      cy.url().should("eq", Cypress.config().baseUrl + "/");
      H.assertChatVisibility("not.visible");
      cy.get("@agentReq.all").should("have.length", 0);

      cy.log(
        "visiting '/question/ask' should redirect to notebook when metabot is disabled",
      );
      cy.visit("/question/ask");
      cy.url().should("include", "/question#");
      cy.findByTestId("metabot-chat").should("not.exist");
    });
  });
});

describe("Metabot in full-app embedding", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.setupAnthropicLlmProvider();
  });

  it("should show the metabot button only when embedded-metabot-enabled? is true", () => {
    H.updateEnterpriseSettings({ "embedded-metabot-enabled?": false });

    H.visitFullAppEmbeddingUrl({
      url: `/question/${ORDERS_BY_YEAR_QUESTION_ID}`,
      qs: {},
    });

    cy.log("Wait for the question to render");
    H.main().findByText("Filter").should("be.visible");

    cy.log("Assert metabot buttons are not rendered");
    H.appBar().icon("metabot").should("not.exist");

    H.updateEnterpriseSettings({ "embedded-metabot-enabled?": true });

    H.visitFullAppEmbeddingUrl({
      url: `/question/${ORDERS_BY_YEAR_QUESTION_ID}`,
      qs: {},
    });

    H.appBar().icon("metabot").should("be.visible");
  });
});

const whoIsYourFavoriteResponse = H.createMetabotSSEBody(
  H.metabotTextPart("You, but don't tell anyone."),
  H.metabotDataPart("state", { queries: {} }),
  H.metabotFinishPart("stop", {
    usage: { inputTokens: 4916, outputTokens: 8, totalTokens: 4924 },
  }),
);

const apiKeyInvalidResponse = H.createMetabotSSEBody(
  H.metabotErrorPart("Anthropic API key expired or invalid"),
  H.metabotFinishPart("error"),
);

function getContainerPadding($container: JQuery<HTMLElement>) {
  const style = getComputedStyle($container[0]);
  return {
    top: parseFloat(style.paddingTop),
    bottom: parseFloat(style.paddingBottom),
  };
}

function assertFillerReachesContainerBottom() {
  cy.findByTestId("metabot-chat-messages").should(($container) => {
    const containerRect = $container[0].getBoundingClientRect();
    const fillerRect = $container
      .find("[data-testid='metabot-message-filler']")[0]
      .getBoundingClientRect();
    expect(fillerRect.height).to.be.greaterThan(0);
    expect(fillerRect.bottom).to.be.closeTo(
      containerRect.bottom - getContainerPadding($container).bottom,
      1,
    );
  });
}

function assertLastPromptAtContainerTop() {
  cy.findByTestId("metabot-chat-messages").should(($container) => {
    const containerRect = $container[0].getBoundingClientRect();
    const prompts = $container.find("[data-message-role='user']").toArray();
    expect(prompts).to.have.length.greaterThan(0);
    const promptRect = prompts[prompts.length - 1].getBoundingClientRect();
    expect(promptRect.top).to.be.closeTo(
      containerRect.top + getContainerPadding($container).top,
      2,
    );
  });
}
