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
        delay: 100, // small delay to detect loading state
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
  });
});

const whoIsYourFavoriteResponse = [
  '0:"You, but don\'t tell anyone."',
  '2:{"type":"state","value":{"queries":{}}}',
  'd:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}',
].join("\n");
