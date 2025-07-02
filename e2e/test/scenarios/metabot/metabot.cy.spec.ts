import {
  activateToken,
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
} from "e2e/support/helpers";

const loremIpsum =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer auctor id erat non sollicitudin. ";

describe("Metabot UI", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/ee/metabot-v3/v2/agent-streaming").as(
      "agentReq",
    );
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
      activateToken("bleeding-edge");
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
        "Metabot is currently offline. Please try again later.",
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

    describe("scroll management", () => {
      it("should not show filler element if there are not messages", () => {
        openMetabotViaSearchButton();
        chatMessages().should("not.exist");
        cy.findByTestId("metabot-message-filler").should("not.exist");
      });

      it("should correctly size the filler element to take remaining space if messages aren't scrollable", () => {
        openMetabotViaSearchButton();

        mockMetabotResponse({
          statusCode: 200,
          body: whoIsYourFavoriteResponse,
        });

        sendMetabotMessage("Who is your favorite?");
        cy.findByTestId("metabot-chat-inner-messages")
          .invoke("innerHeight")
          .then((containerHeight) => {
            cy.findByTestId("metabot-chat-inner-messages")
              .children()
              .then(($children) => {
                const contentHeight = Array.from($children).reduce(
                  (sum, child) => {
                    return sum + child.clientHeight;
                  },
                  0,
                );
                expect(containerHeight).not.to.equal(undefined);
                // we can get some subpixel differences, this isn't a big deal
                expect(contentHeight).to.be.closeTo(containerHeight ?? 0, 1);
              });
          });
      });

      it("should resize filler element and auto-scroll to new prompt on subsequent messages", () => {
        openMetabotViaSearchButton();
        mockMetabotResponse({
          statusCode: 200,
          body: whoIsYourFavoriteResponse,
        });
        sendMetabotMessage("Who is your favorite?");

        cy.log("test on message shorter than prompt");
        mockMetabotResponse({
          statusCode: 200,
          body: `0:"${loremIpsum.repeat(5)}"
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        });
        sendMetabotMessage("You really mean that?");
        cy.log("scroll new prompt to top of the scroll area");
        cy.findByTestId("metabot-chat-inner-messages")
          .findByText("You really mean that?")
          .invoke("scrollTop")
          .then((scrollTop) => expect(scrollTop).to.equal(0));

        cy.log(
          "if the response is shorter than the scroll area, filler should have height",
        );
        cy.findByTestId("metabot-message-filler").then(($el) => {
          expect($el[0].clientHeight).to.be.greaterThan(0);
        });

        mockMetabotResponse({
          statusCode: 200,
          body: `0:"${loremIpsum.repeat(50)}"
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        });
        sendMetabotMessage("Keep going...");

        cy.log(
          "if the response is longer than the scroll area the filler height should be zero",
        );
        cy.findByTestId("metabot-message-filler").then(($el) => {
          expect($el[0].clientHeight).to.equal(0);
        });
      });

      it("should open metabot to the bottom of the conversation when reopened with message history", () => {
        mockMetabotResponse({
          statusCode: 200,
          body: `0:"${loremIpsum.repeat(5)}"
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        });
        openMetabotViaSearchButton();
        sendMetabotMessage("Who is your favorite?");

        closeMetabotViaCloseButton();
        openMetabotViaSearchButton();
        cy.findByTestId("metabot-chat-inner-messages").then(($el) => {
          const el = $el[0];
          const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
          expect(isAtBottom).to.be.true;
        });
      });
    });
  });
});

const whoIsYourFavoriteResponse = `0:"You, but don't tell anyone."
2:{"type":"state","version":1,"value":{"queries":{}}}
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
