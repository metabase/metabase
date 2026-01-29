import type { StaticResponse } from "cypress/types/net-stubbing";

import { appBar } from "./e2e-ui-elements-helpers";

export function metabotChatSidebar() {
  return cy.findByTestId("metabot-chat");
}

export function assertChatVisibility(visibility: "visible" | "not.visible") {
  metabotChatSidebar().should(
    visibility === "visible" ? "be.visible" : "not.exist",
  );
}

export function openMetabotViaShortcutKey(assertVisibility = true) {
  if (assertVisibility) {
    assertChatVisibility("not.visible");
  }

  cy.get("body").type("{ctrl+e}{cmd+e}");

  if (assertVisibility) {
    assertChatVisibility("visible");
  }
}

export function closeMetabotViaShortcutKey(assertVisibility = true) {
  if (assertVisibility) {
    assertChatVisibility("visible");
  }

  cy.get("body").type("{ctrl+e}{cmd+e}");

  if (assertVisibility) {
    assertChatVisibility("not.visible");
  }
}

export function openMetabotViaSearchButton(assertVisibility = true) {
  if (assertVisibility) {
    assertChatVisibility("not.visible");
  }

  appBar().icon("metabot").click();

  if (assertVisibility) {
    assertChatVisibility("visible");
  }
}

export function closeMetabotViaCloseButton(assertVisibility = true) {
  cy.findByTestId("metabot-close-chat").click();

  if (assertVisibility) {
    assertChatVisibility("not.visible");
  }
}

export function metabotChatInput() {
  return cy.findByTestId("metabot-chat-input");
}

export function sendMetabotMessage(input: string) {
  metabotChatInput()
    .should("not.be.disabled")
    .click()
    .type(input)
    .type("{Enter}");
}

export function chatMessages() {
  return cy.findAllByTestId("metabot-chat-message");
}

export function lastChatMessage() {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return chatMessages().last();
}

export const mockMetabotResponse = (response: StaticResponse) => {
  return cy
    .intercept("POST", "/api/ee/metabot-v3/native-agent-streaming", (req) => {
      req.reply({
        status: 200,
        ...response,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          ...response.headers,
        },
      });
    })
    .as("metabotAgent");
};
