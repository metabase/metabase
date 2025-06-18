export function createMockReadableStream(
  textChunks: string[],
  options?: {
    disableAutoInsertNewLines: boolean;
  },
) {
  return new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();
      try {
        for (const textChunk of textChunks) {
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

export function mockStreamedEndpoint({
  url,
  textChunks,
  initialDelay = 0,
}: {
  url: string;
  textChunks: string[] | undefined;
  initialDelay?: number;
}) {
  const originalFetch = global.fetch;

  // fetch-mock is supposed to work with ReadableStreams, but when passed one
  // the getReader methods ends up as undefined
  return jest
    .spyOn(global, "fetch")
    .mockImplementation((fetchedUrl, ...args) => {
      const isRequestedUrl =
        typeof fetchedUrl === "string" && fetchedUrl.includes(url);

      if (isRequestedUrl) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              status: 202,
              ok: true,
              body: textChunks
                ? createMockReadableStream(textChunks)
                : undefined,
            } as any);
          }, initialDelay);
        });
      } else {
        return originalFetch(fetchedUrl, ...args);
      }
    });
}
