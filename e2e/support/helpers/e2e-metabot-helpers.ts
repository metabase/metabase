import type { StaticResponse } from "cypress/types/net-stubbing";

import type {
  FinishReason,
  MessageMetadata,
  SSEEvent,
} from "metabase/api/ai-streaming/sse-types";

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

const lifecycleStartFor = (events: SSEEvent[]): SSEEvent[] => {
  const first = events[0]?.type;
  return first === "start" || first === "start-step"
    ? []
    : [{ type: "start", messageId: "mock-message" }, { type: "start-step" }];
};

const lifecycleFinishFor = (events: SSEEvent[]): (SSEEvent | "[DONE]")[] => {
  const last = events.at(-1)?.type;
  const tail: (SSEEvent | "[DONE]")[] = [];
  if (last !== "finish-step" && last !== "finish") {
    tail.push({ type: "finish-step" });
  }
  if (last !== "finish") {
    tail.push({ type: "finish", finishReason: "stop" });
  }
  tail.push("[DONE]");
  return tail;
};

/**
 * Serialize Metabot v2 SSE events into a `text/event-stream` response body.
 *
 * Each event becomes a `data: {JSON}\n\n` chunk. The full backend lifecycle is
 * wrapped around the provided events to match real server output:
 *   `start` → `start-step` → ...<your events>... → `finish-step` → `finish` → `[DONE]`
 * Any lifecycle event supplied at the head or tail is preserved and not
 * duplicated, so a custom `finish` (e.g. with `finishReason: "error"`) flows
 * through unchanged.
 */
export const createMetabotSSEBody = (events: SSEEvent[]): string =>
  [...lifecycleStartFor(events), ...events, ...lifecycleFinishFor(events)]
    .map((event) => {
      const payload = typeof event === "string" ? event : JSON.stringify(event);
      return `data: ${payload}\n\n`;
    })
    .join("");

/** A streamed assistant text message, emitted as start/delta/end events. */
export const metabotTextPart = (text: string, id = "text-0"): SSEEvent[] => [
  { type: "text-start", id },
  { type: "text-delta", id, delta: text },
  { type: "text-end", id },
];

/** A `data-{subtype}` part, e.g. `metabotDataPart("state", { queries: {} })`. */
export const metabotDataPart = (subtype: string, data: unknown): SSEEvent => ({
  type: `data-${subtype}`,
  data,
});

/** A streamed error message. */
export const metabotErrorPart = (errorText: string): SSEEvent => ({
  type: "error",
  errorText,
});

/** The trailing finish event; carries the finish reason and usage metadata. */
export const metabotFinishPart = (
  finishReason: FinishReason = "stop",
  messageMetadata?: MessageMetadata,
): SSEEvent => ({
  type: "finish",
  finishReason,
  ...(messageMetadata ? { messageMetadata } : {}),
});

export const mockMetabotResponse = (response: StaticResponse) => {
  return cy
    .intercept("POST", "/api/metabot/agent-streaming", (req) => {
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
