/**
 * Shared home for the whole Metabot family (metabot, metabot-query-builder,
 * native-sql-generation, transforms-codegen, ai-controls, document-metabot).
 * Port of e2e/support/helpers/e2e-metabot-helpers.ts.
 *
 * The LLM is STUBBED, never real: specs intercept POST
 * /api/metabot/agent-streaming and return a canned SSE body built from the
 * pure builders below (createMetabotSSEBody / metabotTextPart / …). No API
 * key, fully jar-verifiable.
 *
 * Port notes:
 * - SSE types are inlined (copied from frontend/src/metabase/api/ai-streaming/
 *   sse-types.ts): the e2e-playwright tsconfig has no path aliases, so app
 *   source can't be imported. Kept a faithful subset so the builders stay
 *   near-verbatim.
 * - The chat input (data-testid="metabot-chat-input") is a tiptap/ProseMirror
 *   contenteditable, not a form field, so sendMetabotMessage clicks to focus,
 *   asserts the .ProseMirror took focus (PORTING rule 5), then inserts the
 *   text in one shot (keyboard.insertText — char-by-char keyboard.type would
 *   be pathologically slow for the loremIpsum.repeat(50) messages).
 * - The `$mod+e` toggle (Metabot.tsx:123, tinykeys) → keyboard.press
 *   "ControlOrMeta+e"; the Cypress helper typed both {ctrl+e}{cmd+e} to cover
 *   both platforms, ControlOrMeta collapses that to one platform-correct press.
 * - mockMetabotResponse: cy.intercept(...).reply({...}) → page.route(...).
 *   fulfill(...). route.fulfill sends the whole body at once, same as cy's
 *   req.reply, so canned (non-incremental) streams are faithful. Playwright's
 *   per-test context is torn down after each test, so the route never outlives
 *   the test.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import { appBar, icon } from "./ui";

// ---------------------------------------------------------------------------
// SSE wire-protocol types (inlined subset of
// frontend/src/metabase/api/ai-streaming/sse-types.ts)
// ---------------------------------------------------------------------------

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type MessageMetadata = {
  usage?: TokenUsage;
  usageByModel?: Record<string, TokenUsage>;
  errorCode?: string;
  userMessageId?: string;
};

export type ProviderMetadata = Record<string, Record<string, unknown>>;

export type FinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

type StartEvent = {
  type: "start";
  messageId?: string;
  messageMetadata?: MessageMetadata;
};
type StartStepEvent = { type: "start-step" };
type FinishStepEvent = { type: "finish-step" };
type FinishEvent = {
  type: "finish";
  finishReason?: FinishReason;
  messageMetadata?: MessageMetadata;
};
type MessageMetadataEvent = {
  type: "message-metadata";
  messageMetadata: MessageMetadata;
};
type TextStartEvent = {
  type: "text-start";
  id: string;
  providerMetadata?: ProviderMetadata;
};
type TextDeltaEvent = {
  type: "text-delta";
  id: string;
  delta: string;
  providerMetadata?: ProviderMetadata;
};
type TextEndEvent = {
  type: "text-end";
  id: string;
  providerMetadata?: ProviderMetadata;
};
type ErrorEvent = { type: "error"; errorText: string };
type DataEvent = {
  type: `data-${string}`;
  id?: string;
  data: unknown;
  transient?: boolean;
};

export type SSEEvent =
  | StartEvent
  | StartStepEvent
  | FinishStepEvent
  | FinishEvent
  | MessageMetadataEvent
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ErrorEvent
  | DataEvent;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function metabotChatSidebar(page: Page): Locator {
  return page.getByTestId("metabot-chat");
}

export async function assertChatVisibility(
  page: Page,
  visibility: "visible" | "not.visible",
) {
  if (visibility === "visible") {
    await expect(metabotChatSidebar(page)).toBeVisible();
  } else {
    // Cypress asserted `not.exist`, not merely `not.be.visible`.
    await expect(metabotChatSidebar(page)).toHaveCount(0);
  }
}

export async function openMetabotViaShortcutKey(
  page: Page,
  assertVisibility = true,
) {
  if (assertVisibility) {
    await assertChatVisibility(page, "not.visible");
  }

  // The `$mod+e` toggle (Metabot.tsx, tinykeys) lives in MetabotAuthenticated,
  // which only mounts once `hasMetabotAccess` is true — and that waits on the
  // permissions query (GET /api/metabot/permissions/user-permissions)
  // resolving. On a cold/contended per-worker backend that query can outlast
  // any fixed settle, so a single cold press lands before the keymap exists, is
  // silently dropped, and the chat never opens. It passes only on warm-backend
  // state. Re-nudge the shortcut until the sidebar is visible (the PORTING
  // re-nudge pattern, mirroring native-sql-generation.ts openInlineSQLPrompt): a
  // dropped press is a harmless no-op, and once the keymap is installed a press
  // opens the chat.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+e");
    await expect(metabotChatSidebar(page)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
}

export async function closeMetabotViaShortcutKey(
  page: Page,
  assertVisibility = true,
) {
  if (assertVisibility) {
    await assertChatVisibility(page, "visible");
  }

  await page.keyboard.press("ControlOrMeta+e");

  if (assertVisibility) {
    await assertChatVisibility(page, "not.visible");
  }
}

export async function openMetabotViaSearchButton(
  page: Page,
  assertVisibility = true,
) {
  if (assertVisibility) {
    await assertChatVisibility(page, "not.visible");
  }

  await icon(appBar(page), "metabot").click();

  if (assertVisibility) {
    await assertChatVisibility(page, "visible");
  }
}

export async function closeMetabotViaCloseButton(
  page: Page,
  assertVisibility = true,
) {
  await page.getByTestId("metabot-close-chat").click();

  if (assertVisibility) {
    await assertChatVisibility(page, "not.visible");
  }
}

export function metabotChatInput(page: Page): Locator {
  return page.getByTestId("metabot-chat-input");
}

export async function sendMetabotMessage(page: Page, input: string) {
  const chatInput = metabotChatInput(page);
  // Cypress `.should("not.be.disabled")`: the input is disabled (as a class)
  // while Metabot is responding. toBeEnabled waits it back out.
  await expect(chatInput).toBeEnabled();
  await chatInput.click();
  // The tiptap editable inside the testid wrapper — assert it took focus
  // before typing (PORTING rule 5), then insert the whole message at once.
  const editable = chatInput.locator(".ProseMirror");
  await expect(editable).toBeFocused();
  await page.keyboard.insertText(input);
  await page.keyboard.press("Enter");
}

export function chatMessages(page: Page): Locator {
  return page.getByTestId("metabot-chat-message");
}

export function lastChatMessage(page: Page): Locator {
  return chatMessages(page).last();
}

// ---------------------------------------------------------------------------
// SSE body builders (pure functions — near-verbatim from the Cypress helper)
// ---------------------------------------------------------------------------

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
 * Serialize Metabot v2 SSE parts into a `text/event-stream` response body.
 *
 * Accepts each part as a positional argument; a part is either one event or an
 * array of events (e.g. `metabotTextPart`, which expands to start/delta/end).
 * Arguments are flattened one level, so parts compose without spreading:
 *   createMetabotSSEBody(
 *     metabotTextPart("Here is the link"),
 *     metabotDataPart("navigate_to", path),
 *   )
 *
 * Each event is emitted as a `data: {JSON}\n\n` chunk, wrapped in the backend
 * lifecycle to match real server output:
 *   `start` → `start-step` → ...<parts>... → `finish-step` → `finish` → `[DONE]`
 * A lifecycle event supplied at the head or tail is preserved rather than
 * duplicated, so a custom `finish` (e.g. `finishReason: "error"`) flows through.
 */
export const createMetabotSSEBody = (
  ...parts: Array<SSEEvent | SSEEvent[]>
): string => {
  const events = parts.flat();
  return [
    ...lifecycleStartFor(events),
    ...events,
    ...lifecycleFinishFor(events),
  ]
    .map((event) => {
      const payload = typeof event === "string" ? event : JSON.stringify(event);
      return `data: ${payload}\n\n`;
    })
    .join("");
};

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

// ---------------------------------------------------------------------------
// Network mock
// ---------------------------------------------------------------------------

/**
 * Port of H.mockMetabotResponse. Fulfils POST /api/metabot/agent-streaming with
 * a canned SSE body. Re-calling within a test registers a fresh handler that
 * takes precedence (Playwright matches routes most-recent-first), mirroring
 * Cypress's last-intercept-wins re-mocking.
 */
export async function mockMetabotResponse(
  page: Page,
  response: { statusCode?: number; body: string; headers?: Record<string, string> },
) {
  await page.route("**/api/metabot/agent-streaming", (route) =>
    route.fulfill({
      status: response.statusCode ?? 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: response.headers,
      body: response.body,
    }),
  );
}
