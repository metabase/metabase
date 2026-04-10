import { EventSourceParserStream } from "eventsource-parser/stream";

import type { SSEEvent } from "./sse-types";

/**
 * Parse a Server-Sent Events stream into typed SSE events.
 * Yields parsed JSON event objects and terminates on the `[DONE]` sentinel.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const eventStream = stream
    // TypeScript v5.9 issue - cast works around TS Uint8Array generic variance issue: https://github.com/microsoft/TypeScript/issues/62240
    .pipeThrough(
      new TextDecoderStream() as unknown as ReadableWritablePair<
        string,
        Uint8Array<ArrayBufferLike>
      >,
    )
    .pipeThrough(new EventSourceParserStream());

  const reader = eventStream.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done || value.data === "[DONE]") {
        return;
      }

      yield JSON.parse(value.data) as SSEEvent;
    }
  } finally {
    reader.releaseLock();
  }
}
