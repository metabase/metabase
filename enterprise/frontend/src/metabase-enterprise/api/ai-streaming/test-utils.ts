export function createMockReadableStream(textChunks: string[]) {
  return new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();
      try {
        for (const textChunk of textChunks) {
          controller.enqueue(textEncoder.encode(`${textChunk}\n`));
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
  textChunks: string[];
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
              body: createMockReadableStream(textChunks),
            } as any);
          }, initialDelay);
        });
      } else {
        return originalFetch(fetchedUrl, ...args);
      }
    });
}
