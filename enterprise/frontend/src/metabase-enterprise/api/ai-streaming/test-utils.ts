import { defer } from "metabase/lib/promise";

export function createPauses<Count extends number>(count: Count) {
  const pauses = new Array(count).fill(null).map(() => defer());
  return pauses as ReturnType<typeof defer>[] & { length: Count };
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

export type MockStreamedEndpointParams =
  | {
      textChunks: string[] | undefined;
      stream?: undefined;
      waitForResponse?: boolean;
    }
  | {
      textChunks?: undefined;
      stream: ReadableStream<any>;
      waitForResponse?: boolean;
    };

export function mockStreamedEndpoint(
  url: string,
  { textChunks, stream, waitForResponse = false }: MockStreamedEndpointParams,
) {
  const responseGate = waitForResponse ? defer() : null;

  const mock = mockEndpoint(url, async (init) => {
    await responseGate?.promise;
    const body =
      stream ||
      (textChunks && createMockReadableStream(textChunks)) ||
      undefined;

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
