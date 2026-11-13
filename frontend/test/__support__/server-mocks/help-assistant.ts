import fetchMock from "fetch-mock";

import { mockEndpoint } from "metabase/api/ai-streaming/test-utils";
import { delay as wait } from "metabase/utils/promise";
import type {
  HelpAssistantChatResponse,
  HelpAssistantConversation,
  HelpAssistantConversationId,
  HelpAssistantStreamEvent,
} from "metabase-types/api";

const CONVERSATIONS_PATH = "/api/user-key-value/namespace/help_assistant";
const CHAT_STREAM_PATH = "/api/help-assistant/chat/stream";

export const HELP_ASSISTANT_ROUTES = {
  feedback: "help-assistant-feedback",
  flag: "help-assistant-flag",
  saveConversation: "help-assistant-save-conversation",
  deleteConversation: "help-assistant-delete-conversation",
} as const;

const encoder = new TextEncoder();
const encodeEvent = (data: HelpAssistantStreamEvent | "[DONE]") =>
  encoder.encode(
    `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`,
  );

/**
 * A chat stream that a test writes to one event at a time, to check what
 * shows while the assistant is still working.
 */
export function createHelpAssistantEventStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  // `start` runs right away, so `controller` is set before this returns.
  const stream = new ReadableStream<Uint8Array>({
    start: (streamController) => {
      controller = streamController;
    },
  });
  return {
    stream,
    send: (event: HelpAssistantStreamEvent) =>
      controller?.enqueue(encodeEvent(event)),
    finish: () => {
      controller?.enqueue(encodeEvent("[DONE]"));
      controller?.close();
    },
  };
}

/** A step event for each of the answer's steps, then the answer, then `[DONE]`. */
function answerStream(answer: HelpAssistantChatResponse) {
  const { stream, send, finish } = createHelpAssistantEventStream();
  answer.steps.forEach((step) => send({ type: "step", step }));
  send({ type: "answer", ...answer });
  finish();
  return stream;
}

/**
 * - an answer: streamed as its steps, then the answer
 * - a number: an error response with that status and no body
 * - a stream: sent as it is, see [[createHelpAssistantEventStream]]
 * - a function: called for each request, to respond later
 */
export type HelpAssistantChatMockResponse =
  | HelpAssistantChatResponse
  | number
  | ReadableStream<Uint8Array>
  | (() => Promise<HelpAssistantChatMockResponse>);

/** Lets reading `stream` be cut off by `signal`, like a real response body. */
function abortableStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal | null | undefined,
) {
  const reader = stream.getReader();
  const aborted = new Promise<never>((_, reject) => {
    signal?.addEventListener("abort", () =>
      reject(new DOMException("The request was aborted", "AbortError")),
    );
  });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

async function respond(
  response: HelpAssistantChatMockResponse,
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  if (typeof response === "function") {
    return respond(await response(), signal);
  }
  if (typeof response === "number") {
    return new Response(null, { status: response });
  }
  const body = abortableStream(
    response instanceof ReadableStream ? response : answerStream(response),
    signal,
  );
  // In Jest, a `Response` body isn't a web `ReadableStream`, so put one in.
  const streamResponse = new Response(null, { status: 202 });
  Object.defineProperty(streamResponse, "body", { value: body });
  return streamResponse;
}

/**
 * Mocks `POST /api/help-assistant/chat/stream`. fetch-mock can't serve a
 * stream, so it doesn't see these requests: use the returned helpers instead.
 */
export function setupHelpAssistantChatEndpoint(
  response: HelpAssistantChatMockResponse,
  { delay }: { delay?: number } = {},
) {
  let nextResponse = response;
  const requestBodies: unknown[] = [];

  mockEndpoint(CHAT_STREAM_PATH, async (init) => {
    const request = init instanceof Request ? init : undefined;
    requestBodies.push(await request?.clone().json());
    const signal = init?.signal;
    if (delay != null) {
      await wait(delay, signal ?? undefined);
    }
    if (signal?.aborted) {
      throw new DOMException("The request was aborted", "AbortError");
    }
    return respond(nextResponse, signal);
  });

  return {
    lastRequestBody: () => requestBodies.at(-1),
    requestCount: () => requestBodies.length,
    setResponse: (response: HelpAssistantChatMockResponse) => {
      nextResponse = response;
    },
  };
}

export function setupHelpAssistantFeedbackEndpoint() {
  fetchMock.post(
    "path:/api/help-assistant/feedback",
    { status: 204 },
    { name: HELP_ASSISTANT_ROUTES.feedback },
  );
}

export function setupHelpAssistantSettingsEndpoint({
  flagsEnabled = false,
}: { flagsEnabled?: boolean } = {}) {
  fetchMock.get("path:/api/help-assistant/settings", {
    flags_enabled: flagsEnabled,
  });
}

export function setupHelpAssistantFlagEndpoint() {
  fetchMock.post(
    "path:/api/help-assistant/flag",
    { file: "2026-11-10_120000_why-is-sync-slow.yaml" },
    { name: HELP_ASSISTANT_ROUTES.flag },
  );
}

export function setupHelpAssistantConversationsEndpoints(
  conversations: Record<
    HelpAssistantConversationId,
    HelpAssistantConversation
  > = {},
) {
  // The endpoint has no body when nothing is saved yet.
  fetchMock.get(
    `path:${CONVERSATIONS_PATH}`,
    Object.keys(conversations).length > 0
      ? { status: 200, body: conversations }
      : { status: 204 },
  );
  fetchMock.put(
    `express:${CONVERSATIONS_PATH}/key/:key`,
    { status: 200 },
    { name: HELP_ASSISTANT_ROUTES.saveConversation },
  );
  fetchMock.delete(
    `express:${CONVERSATIONS_PATH}/key/:key`,
    { status: 200 },
    { name: HELP_ASSISTANT_ROUTES.deleteConversation },
  );
}
