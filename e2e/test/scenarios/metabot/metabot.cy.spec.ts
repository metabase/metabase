import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

const loremIpsum =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer auctor id erat non sollicitudin. ";

describe("Metabot UI", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/ee/metabot-v3/agent-streaming").as("agentReq");
    cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
      "xrayCandidates",
    );
  });

  describe("OSS", { tags: "@OSS" }, () => {
    beforeEach(() => {
      cy.visit("/");
      cy.wait("@xrayCandidates");
    });

    it("should not be available in OSS", () => {
      H.openMetabotViaShortcutKey(false);
      H.assertChatVisibility("not.visible");
      cy.findByLabelText("Navigation bar").within(() => {
        cy.findByText("New").click();
      });
      H.popover().findByText("Metabot request").should("not.exist");
      H.assertChatVisibility("not.visible");
    });
  });

  describe("EE", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
      cy.visit("/");
      cy.wait("@xrayCandidates");
    });

    describe("scroll management", () => {
      it("should not show filler element if there are not messages", () => {
        H.openMetabotViaSearchButton();
        H.chatMessages().should("not.exist");
        cy.findByTestId("metabot-message-filler").should("not.exist");
      });

      it("should correctly size the filler element to take remaining space if messages aren't scrollable", () => {
        H.openMetabotViaSearchButton();

        H.mockMetabotResponse({
          statusCode: 200,
          body: whoIsYourFavoriteResponse,
        });

        H.sendMetabotMessage("Who is your favorite?");
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
        H.openMetabotViaSearchButton();
        H.mockMetabotResponse({
          statusCode: 200,
          body: whoIsYourFavoriteResponse,
        });
        H.sendMetabotMessage("Who is your favorite?");

        cy.log("test on message shorter than prompt");
        H.mockMetabotResponse({
          statusCode: 200,
          body: `0:"${loremIpsum.repeat(5)}"
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        });
        H.sendMetabotMessage("You really mean that?");
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

        H.mockMetabotResponse({
          statusCode: 200,
          body: `0:"${loremIpsum.repeat(50)}"
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        });
        H.sendMetabotMessage("Keep going...");

        cy.log(
          "if the response is longer than the scroll area the filler height should be zero",
        );
        cy.findByTestId("metabot-message-filler").then(($el) => {
          expect($el[0].clientHeight).to.equal(0);
        });
      });

      it("should open metabot to the bottom of the conversation when reopened with message history", () => {
        H.mockMetabotResponse({
          statusCode: 200,
          body: `0:"${loremIpsum.repeat(5)}"
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
        });
        H.openMetabotViaSearchButton();
        H.sendMetabotMessage("Who is your favorite?");

        H.closeMetabotViaCloseButton();
        H.openMetabotViaSearchButton();
        cy.findByTestId("metabot-chat-inner-messages").then(($el) => {
          const el = $el[0];
          const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
          expect(isAtBottom).to.equal(true);
        });
      });
    });
  });

  describe("metabot events", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.restore();
      cy.signInAsAdmin();
      H.enableTracking();
      H.activateToken("bleeding-edge");
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should track Metabot chart explainer", () => {
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      cy.findByLabelText("Explain this chart").should("be.visible").click();

      H.expectUnstructuredSnowplowEvent({
        event: "metabot_explain_chart_clicked",
      });
    });

    describe("Metabot chat", () => {
      beforeEach(() => {
        cy.visit("/");
        cy.wait("@xrayCandidates");
      });

      it("should be able to be opened and closed", () => {
        H.openMetabotViaSearchButton();
        H.expectUnstructuredSnowplowEvent({
          event: "metabot_chat_opened",
          triggered_from: "header",
        });
        H.closeMetabotViaCloseButton();
      });

      it("should be controlled via keyboard shortcut", () => {
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
      });

      it("should allow a user to send a message to the agent and handle successful or failed responses", () => {
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

        H.mockMetabotResponse({ statusCode: 500 });
        H.sendMetabotMessage("Who is your favorite?");
        H.lastChatMessage().should(
          "have.text",
          "Metabot is currently offline. Please try again later.",
        );
      });

      it("should allow starting a new metabot conversation via the /metabot/new", () => {
        H.mockMetabotResponse({
          statusCode: 200,
          body: whoIsYourFavoriteResponse,
        });
        cy.visit("/metabot/new?q=Who%20is%20your%20favorite%3F");
        H.assertChatVisibility("visible");
        H.lastChatMessage().should("have.text", "You, but don't tell anyone.");
      });
    });
  });
});

const whoIsYourFavoriteResponse = `0:"You, but don't tell anyone."
2:{"type":"state","version":1,"value":{"queries":{}}}
d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
