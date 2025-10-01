import { defer } from "metabase/lib/promise";

async function delay(timeout: number) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(undefined), timeout);
  });
}

export function createPauses<Count extends number>(count: Count) {
  const pauses = new Array(count).fill(null).map(() => defer());
  return pauses as ReturnType<typeof defer>[] & { length: Count };
}

export function createMockReadableStream(
  textChunks: string[] | AsyncGenerator<string, void, unknown>,
  options?: {
    disableAutoInsertNewLines: boolean;
  },
) {
  return new ReadableStream({
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
  });
}

export function mockEndpoint<T extends Response>(
  url: string,
  endpointMock: () => Promise<T>,
) {
  const originalFetch = global.fetch;
  const mockedFetch = jest.spyOn(global, "fetch");

  // fetch-mock is supposed to work with ReadableStreams, but when passed one
  // the getReader methods ends up as undefined
  return mockedFetch.mockImplementation((fetchedUrl, ...args) => {
    const isRequestedUrl =
      typeof fetchedUrl === "string" && fetchedUrl.includes(url);

    if (isRequestedUrl) {
      return endpointMock();
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
      textChunks: string[] | undefined;
      stream?: undefined;
      initialDelay?: number;
    }
  | {
      textChunks?: undefined;
      stream: ReadableStream<any>;
      initialDelay?: number;
    };

export function mockStreamedEndpoint(
  url: string,
  { textChunks, stream, initialDelay = 0 }: MockStreamedEndpointParams,
) {
  return mockEndpoint(url, async () => {
    await delay(initialDelay);
    return {
      status: 202,
      ok: true,
      body:
        stream ||
        (textChunks && createMockReadableStream(textChunks)) ||
        undefined,
    } as any;
  });
}
