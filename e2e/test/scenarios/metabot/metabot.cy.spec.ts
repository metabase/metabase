import {
  assertChatVisibility,
  closeMetabotViaCloseButton,
  closeMetabotViaShortcutKey,
  metabotChatInput,
  mockMetabotResponse,
  openMetabotViaNewMenu,
  openMetabotViaShortcutKey,
  popover,
  restore,
  sendMetabotMessage,
  setTokenFeatures,
  userMessages,
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

  // token feature has been disabled so skipping for now - there's currently decent coverage for UI related things in our unit tests
  describe.skip("EE", () => {
    beforeEach(() => {
      setTokenFeatures("all");
      cy.visit("/");
      cy.wait("@sessionProperties");
    });

    // FIXME: shortcut keys aren't working in CI only, but work locally
    it.skip("should be able to be opened and closed", () => {
      openMetabotViaNewMenu();
      closeMetabotViaCloseButton();
      openMetabotViaShortcutKey();
      closeMetabotViaShortcutKey();
    });

    it("should allow a user to send a message to the agent and handle successful or failed responses", () => {
      openMetabotViaNewMenu();
      userMessages().should("not.exist");

      mockMetabotResponse({
        statusCode: 200,
        delay: 100, // small delay to detect loading state
        body: whoIsYourFavoriteResponse,
      });
      sendMetabotMessage("Who is your favorite?");

      metabotChatInput()
        .should("have.attr", "placeholder")
        .and("eq", "Doing science...");
      userMessages()
        .should("exist")
        .should("have.text", "You are... but don't tell anyone!");

      mockMetabotResponse({
        statusCode: 500,
        body: whoIsYourFavoriteResponse,
      });
      sendMetabotMessage("Who is your favorite?");
      userMessages()
        .should("exist")
        .should("have.text", "I'm currently offline, try again later.");
    });
  });
});

const whoIsYourFavoriteResponse = {
  reactions: [
    {
      type: "metabot.reaction/message",
      message: "You are... but don't tell anyone!",
    },
  ],
  history: [
    {
      role: "user",
      content: "Who is your favorite?",
    },
    {
      content: "",
      role: "assistant",
      "tool-calls": [
        {
          id: "call_PVmnR8mcnYFF2AmqupSKzJDh",
          name: "who-is-your-favorite",
          arguments: {},
        },
      ],
    },
    {
      role: "tool",
      "tool-call-id": "call_PVmnR8mcnYFF2AmqupSKzJDh",
      content: "You are... but don't tell anyone!",
    },
    {
      content: "You are... but don't tell anyone!",
      role: "assistant",
    },
  ],
};
