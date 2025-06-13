import {
  assertChatVisibility,
  chatMessages,
  closeMetabotViaCloseButton,
  lastChatMessage,
  mockMetabotResponse,
  openMetabotViaCommandPalette,
  openMetabotViaSearchButton,
  openMetabotViaShortcutKey,
  popover,
  restore,
  sendMetabotMessage,
  setTokenFeatures,
} from "e2e/support/helpers";

describe("Metabot UI", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/ee/metabot-v3/agent").as("agentReq");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");
  });

  describe("OSS", { tags: "@OSS" }, () => {
    beforeEach(() => {
      cy.visit("/");
      cy.wait("@sessionProperties");
    });

    it("should not be available in OSS", () => {
      openMetabotViaShortcutKey(false);
      assertChatVisibility("not.visible");
      cy.findByLabelText("Navigation bar").within(() => {
        cy.findByText("New").click();
      });
      popover().findByText("Metabot request").should("not.exist");
      assertChatVisibility("not.visible");
    });
  });

  describe("EE", () => {
    beforeEach(() => {
      setTokenFeatures("all");
      cy.visit("/");
      cy.wait("@sessionProperties");
    });

    it("should be able to be opened and closed", () => {
      openMetabotViaSearchButton();
      closeMetabotViaCloseButton();

      openMetabotViaCommandPalette();
      closeMetabotViaCloseButton();

      // FIXME: shortcut keys aren't working in CI only, but work locally
      // openMetabotViaShortcutKey();
      // closeMetabotViaShortcutKey();
    });

    it("should allow a user to send a message to the agent and handle successful or failed responses", () => {
      openMetabotViaSearchButton();
      chatMessages().should("not.exist");

      mockMetabotResponse({
        statusCode: 200,
        body: whoIsYourFavoriteResponse,
      });
      sendMetabotMessage("Who is your favorite?");

      lastChatMessage().should("have.text", "You, but don't tell anyone.");

      mockMetabotResponse({ statusCode: 500 });
      sendMetabotMessage("Who is your favorite?");
      lastChatMessage().should(
        "have.text",
        "I'm currently offline, try again later.",
      );
    });

    it("should allow starting a new metabot conversation via the /metabot/new", () => {
      mockMetabotResponse({
        statusCode: 200,
        body: whoIsYourFavoriteResponse,
      });
      cy.visit("/metabot/new?q=Who%20is%20your%20favorite%3F");
      assertChatVisibility("visible");
      lastChatMessage().should("have.text", "You, but don't tell anyone.");
    });
  });
});

const whoIsYourFavoriteResponse = {
  reactions: [
    {
      type: "metabot.reaction/message",
      "repl/message_color": "green",
      "repl/message_emoji": "🤖",
      message: "You, but don't tell anyone.",
    },
  ],
  history: [
    {
      role: "user",
      content: "Who is your favorite?",
    },
    {
      content: "You, but don't tell anyone.",
      role: "assistant",
    },
  ],
  state: {
    queries: {},
  },
  conversation_id: "8dcf1268-11a7-803f-50ee-37d3ed27b179",
};
