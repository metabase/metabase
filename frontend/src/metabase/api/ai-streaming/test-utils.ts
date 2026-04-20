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
  endpointMock: (init?: RequestInit) => Promise<T>,
) {
  const originalFetch = global.fetch;
  const mockedFetch = jest.spyOn(global, "fetch");

  // fetch-mock is supposed to work with ReadableStreams, but when passed one
  // the getReader methods ends up as undefined
  return mockedFetch.mockImplementation((fetchedUrl, ...args) => {
    const isRequestedUrl =
      typeof fetchedUrl === "string" && fetchedUrl.includes(url);

    if (isRequestedUrl) {
      return endpointMock(args?.[0]);
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
  stream?: ReadableStream<any>;
  events?: SSEEvent[];
  waitForResponse?: boolean;
};

export function mockStreamedEndpoint(
  url: string,
  { stream, events, waitForResponse = false }: MockStreamedEndpointParams,
) {
  const responseGate = waitForResponse ? defer() : null;

  const mock = mockEndpoint(url, async (init) => {
    await responseGate?.promise;
    const body = stream || (events && createMockSSEStream(events)) || undefined;

    // make stream abortable
    if (body) {
      let activeReader: ReadableStreamDefaultReader<any> | null = null;
      const originalGetReader = body.getReader.bind(body);

      body.getReader = function () {
        activeReader = originalGetReader();
        const originalRead = activeReader.read.bind(activeReader);

        // Race the read with the abort promise
        activeReader.read = async function () {
          return Promise.race([
            originalRead(),
            new Promise<never>((_, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Stream aborted", "AbortError"));
              });
            }),
          ]);
        };

        return activeReader;
      };
    }

    return { status: 202, ok: true, body } as any;
  });

  return Object.assign(mock, {
    sendResponse: () => responseGate?.resolve(),
  });
}
