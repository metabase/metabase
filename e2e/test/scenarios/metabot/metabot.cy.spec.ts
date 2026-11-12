const { H } = cy;

const loremIpsum =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer auctor id erat non sollicitudin. ";

describe("Metabot UI", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.setupAnthropicLlmProvider();
    cy.intercept("GET", "/api/automagic-dashboards/database/*/candidates").as(
      "xrayCandidates",
    );
  });

  describe("scroll management", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
      cy.visit("/");
      cy.wait("@xrayCandidates");
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
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
});

const whoIsYourFavoriteResponse = H.createMetabotSSEBody(
  H.metabotTextPart("You, but don't tell anyone."),
  H.metabotDataPart("state", { queries: {} }),
  H.metabotFinishPart("stop", {
    usage: { inputTokens: 4916, outputTokens: 8, totalTokens: 4924 },
  }),
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
