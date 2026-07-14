import { defer } from "metabase/utils/promise";

import type { SSEEvent } from "./sse-types";

export function createPauses<Count extends number>(count: Count) {
  const pauses = new Array(count).fill(null).map(() => defer());
  return pauses as ReturnType<typeof defer>[] & { length: Count };
}

const lifecycleStartFor = ([first]: SSEEvent[]): SSEEvent[] =>
  first?.type === "start" || first?.type === "start-step"
    ? []
    : [{ type: "start", messageId: "mock-message" }, { type: "start-step" }];

const lifecycleFinishFor = (events: SSEEvent[]) => {
  const last = events.at(-1)?.type;
  return [
    ...(last === "finish-step" || last === "finish"
      ? []
      : [{ type: "finish-step" }]),
    ...(last === "finish" ? [] : [{ type: "finish" }]),
    "[DONE]",
  ];
};

/**
 * Create a mock SSE stream from an array of event objects.
 *
 * Each event is encoded as `data: {JSON}\n\n`; string entries (like "[DONE]") as
 * `data: {string}\n\n`.
 *
 * For array inputs, the full backend lifecycle is wrapped around the provided
 * events to match real server output:
 *   `start` → `start-step` → ...<your events>... → `finish-step` → `finish` → `[DONE]`
 * Any lifecycle event the caller already supplies at the head or tail is
 * preserved and not duplicated, so tests can pass a custom `start` (with a
 * specific `messageId`) or `finish` (with `messageMetadata`) and have it flow
 * through unchanged. Async generator inputs control their own lifecycle.
 */
export function createMockSSEStream(
  events: SSEEvent[] | AsyncGenerator<SSEEvent | string, void, unknown>,
  options?: {
    streamOptions?: Partial<ConstructorParameters<typeof ReadableStream>[0]>;
  },
): ReadableStream<Uint8Array> {
  const source = Array.isArray(events)
    ? [...lifecycleStartFor(events), ...events, ...lifecycleFinishFor(events)]
    : events;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const event of source) {
          const payload =
            typeof event === "string" ? event : JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
    ...(options?.streamOptions ?? {}),
  });
}

export function createMockReadableStream(
  textChunks: string[] | AsyncGenerator<string, void, unknown>,
  options?: {
    disableAutoInsertNewLines?: boolean;
    streamOptions?: Partial<ConstructorParameters<typeof ReadableStream>[0]>;
  },
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const textEncoder = new TextEncoder();
      try {
        for await (const textChunk of textChunks) {
          const text =
            textChunk + (options?.disableAutoInsertNewLines ? "" : "\n");
          controller.enqueue(textEncoder.encode(text));
        }
      } finally {
        controller.close();
      }
    },
    ...(options?.streamOptions ?? {}),
  });
}

export function mockEndpoint<T extends Response>(
  url: string,
  endpointMock: (init?: RequestInit | Request) => Promise<T>,
) {
  const originalFetch = global.fetch;
  const mockedFetch = jest.spyOn(global, "fetch");

  // fetch-mock is supposed to work with ReadableStreams, but when passed one
  // the getReader methods ends up as undefined
  return mockedFetch.mockImplementation((fetchedUrl, ...args) => {
    // The client calls `fetch(new Request(url, init))`, so the first arg may be
    // a Request (or URL) rather than a string.
    const requestUrl =
      fetchedUrl instanceof Request
        ? fetchedUrl.url
        : fetchedUrl instanceof URL
          ? fetchedUrl.href
          : fetchedUrl;
    const isRequestedUrl =
      typeof requestUrl === "string" && requestUrl.includes(url);

    if (isRequestedUrl) {
      return endpointMock(
        fetchedUrl instanceof Request ? fetchedUrl : args?.[0],
      );
    } else {
      // remove calls that route to global fetch
      mockedFetch.mock.calls.pop();
      mockedFetch.mock.instances.pop();
      mockedFetch.mock.results.pop();

      return originalFetch(fetchedUrl, ...args);
    }
  });
}

export type MockStreamedEndpointParams = {
  events?: SSEEvent[];
  textChunks?: string[];
  stream?: ReadableStream<any>;
  waitForResponse?: boolean;
};

export function mockStreamedEndpoint(
  url: string,
  {
    events,
    textChunks,
    stream,
    waitForResponse = false,
  }: MockStreamedEndpointParams,
) {
  const responseGate = waitForResponse ? defer() : null;

  const mock = mockEndpoint(url, async (init) => {
    await responseGate?.promise;
    const source =
      stream ||
      (events && createMockSSEStream(events)) ||
      (textChunks && createMockReadableStream(textChunks));

    if (!source) {
      throw new Error(
        "mockStreamedEndpoint requires one of `stream`, `events`, or `textChunks`",
      );
    }

    // make the stream abortable
    const reader = source.getReader();
    const abortPromise = new Promise<never>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Stream aborted", "AbortError"));
      });
    });
    const body = new ReadableStream({
      async pull(controller) {
        const { value, done } = await Promise.race([
          reader.read(),
          abortPromise,
        ]);
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      },
    });

    return { status: 202, ok: true, body, headers: new Headers() } as any;
  });

  return Object.assign(mock, {
    sendResponse: () => responseGate?.resolve(),
  });
}
