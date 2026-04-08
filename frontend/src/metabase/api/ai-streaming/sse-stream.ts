import type { SSEEvent } from "./sse-types";

/**
 * Parse a Server-Sent Events stream into typed SSE events.
 *
 * Reads from a ReadableStream<Uint8Array>, buffers until SSE event boundaries
 * (\n\n), and yields parsed JSON event objects. Handles the `data: [DONE]`
 * sentinel that signals end of stream.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      // Process complete SSE events (delimited by \n\n)
      let boundaryIndex: number;
      while ((boundaryIndex = buffer.indexOf("\n\n")) !== -1) {
        const eventBlock = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        for (const line of eventBlock.split("\n")) {
          if (!line.startsWith("data: ")) {
            continue;
          }

          const payload = line.slice(6); // strip "data: "

          // [DONE] sentinel — end of stream
          if (payload === "[DONE]") {
            return;
          }

          yield JSON.parse(payload) as SSEEvent;
        }
      }

      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
