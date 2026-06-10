import { defer } from "metabase/utils/promise";

import type { SSEEvent } from "./sse-types";

export function createPauses<Count extends number>(count: Count) {
  const pauses = new Array(count).fill(null).map(() => defer());
  return pauses as ReturnType<typeof defer>[] & { length: Count };
}

function lifecycleStartFor(events: SSEEvent[]): SSEEvent[] {
  const firstType = events[0]?.type;
  if (firstType === "start" || firstType === "start-step") {
    return [];
  }
  return [{ type: "start", messageId: "mock-message" }, { type: "start-step" }];
}

function lifecycleFinishFor(events: SSEEvent[]): (SSEEvent | string)[] {
  const lastType = events[events.length - 1]?.type;
  const tail: (SSEEvent | string)[] = [];
  if (lastType !== "finish-step" && lastType !== "finish") {
    tail.push({ type: "finish-step" });
  }
  if (lastType !== "finish") {
    tail.push({ type: "finish" });
  }
  tail.push("[DONE]");
  return tail;
}

/**
 * Create a mock SSE stream from an array of event objects.
 * Each event is encoded as `data: {JSON}\n\n`. String entries (like "[DONE]")
 * are encoded as `data: {string}\n\n`.
 *
 * For array inputs, the full BE lifecycle is wrapped around the provided
 * events to match real server output:
 *   `start` → `start-step` → ...<your events>... → `finish-step` → `finish` → `[DONE]`
 * Any lifecycle event the caller already supplies at the head or tail is
 * preserved and not duplicated, so tests can pass a custom `start`
 * (with a specific `messageId`) or `finish` (with `messageMetadata`) and have
 * it flow through unchanged.
 *
 * For async generator inputs, the generator
 * controls its own lifecycle — nothing is auto-added.
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

export type MockStreamedEndpointParams =
  | {
      events: SSEEvent[] | undefined;
      stream?: undefined;
      waitForResponse?: boolean;
    }
  | {
      events?: undefined;
      stream: ReadableStream<any>;
      waitForResponse?: boolean;
    };

// the consumer reads the body via pipeThrough, which acquires readers through
// internal stream machinery rather than the public getReader method, so the
// only reliable way to surface an abort is to error the stream itself
function makeAbortableStream(
  stream: ReadableStream<any>,
  signal: AbortSignal | null | undefined,
): ReadableStream<any> {
  if (!signal) {
    return stream;
  }

  const reader = stream.getReader();
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(new DOMException("Stream aborted", "AbortError"));
    if (signal.aborted) {
      fail();
    } else {
      signal.addEventListener("abort", fail);
    }
  });
  aborted.catch(() => {});

  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await Promise.race([reader.read(), aborted]);
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export function mockStreamedEndpoint(
  url: string,
  { events, stream, waitForResponse = false }: MockStreamedEndpointParams,
) {
  const responseGate = waitForResponse ? defer() : null;

  const mock = mockEndpoint(url, async (init) => {
    await responseGate?.promise;
    const rawBody =
      stream || (events && createMockSSEStream(events)) || undefined;
    const body = rawBody && makeAbortableStream(rawBody, init?.signal);

    return { status: 202, ok: true, body, headers: new Headers() } as any;
  });

  return Object.assign(mock, {
    sendResponse: () => responseGate?.resolve(),
  });
}
