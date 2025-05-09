import type { StaticResponse } from "cypress/types/net-stubbing";

import { newButton } from "./e2e-ui-elements-helpers";

export function assertChatVisibility(visibility: "visible" | "not.visible") {
  cy.findByTestId("metabot-chat").should(
    visibility === "visible" ? "be.visible" : "not.exist",
  );
}

export function openMetabotViaShortcutKey(assertVisibility = true) {
  if (assertVisibility) {
    assertChatVisibility("not.visible");
  }

  cy.realPress(["Meta", "b"]);

  if (assertVisibility) {
    assertChatVisibility("visible");
  }
}

export function closeMetabotViaShortcutKey(assertVisibility = true) {
  if (assertVisibility) {
    assertChatVisibility("visible");
  }

  cy.realPress(["Meta", "b"]);

  if (assertVisibility) {
    assertChatVisibility("not.visible");
  }
}

export function openMetabotViaNewMenu(assertVisibility = true) {
  if (assertVisibility) {
    assertChatVisibility("not.visible");
  }

  newButton("Metabot request").click();

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
    .should("be.focused")
    .type(input)
    .type("{Enter}");
}

export function userMessages() {
  return cy.findAllByTestId("metabot-chat-message");
}

export const mockMetabotResponse = (response: StaticResponse) => {
  return cy
    .intercept("POST", "/api/ee/metabot-v3/agent", (req) => {
      req.reply(response);
    })
    .as("metabotAgent");
};
