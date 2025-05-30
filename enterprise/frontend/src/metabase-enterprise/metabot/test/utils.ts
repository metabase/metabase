// ReadableStream from node's "stream/web" module doesn't implement
// the getReader method like the real web implmentation does so we
// need to mock our own
export function createMockReadableStream(textChunks: string[]) {
  const textEncoder = new TextEncoder();

  const mockRead = jest.fn();
  textChunks.forEach((textChunk) => {
    const chunk = textEncoder.encode(`${textChunk}\n`);
    mockRead.mockReturnValueOnce({ done: false, value: chunk });
  });
  mockRead.mockReturnValueOnce({ done: true });

  return {
    getReader: () => ({
      read: mockRead,
      releaseLock: jest.fn(),
    }),
  };
}

export function mockAgentEndpoint(
  textChunks: string[],
  options?: { delay: number },
) {
  const originalFetch = global.fetch;

  // fetch-mock is supposed to work with ReadableStreams, but when passed one
  // the getReader methods ends up as undefined
  return jest.spyOn(global, "fetch").mockImplementation((url, ...args) => {
    const isAgentUrl =
      typeof url === "string" &&
      url.includes("/api/ee/metabot-v3/v2/agent-streaming");

    if (isAgentUrl) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ body: createMockReadableStream(textChunks) } as any);
        }, options?.delay ?? 0);
      });
    } else {
      return originalFetch(url, ...args);
    }
  });
}
