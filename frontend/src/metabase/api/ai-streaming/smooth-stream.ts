import type { SSEEvent, TextDeltaEvent } from "./sse-types";

// Whitespace-terminated, so a word only emits once it's complete.
const WORD_PATTERN = /\S+\s+/m;

const DEFAULT_SMOOTHING_DELAY_MS = 10;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const takeWord = (buffer: string) => {
  const match = WORD_PATTERN.exec(buffer);
  return match ? buffer.slice(0, match.index + match[0].length) : null;
};

export type SmoothTextOptions = { delayInMs?: number };

// Re-emits text deltas one word at a time on a fixed cadence, so text renders at
// a steady pace however unevenly the server chunks it. Awaiting between words
// backpressures the stream, which is what paces it. Non-text events flush the
// buffered tail first to preserve ordering.
export async function* smoothTextEvents(
  events: AsyncIterable<SSEEvent>,
  { delayInMs = DEFAULT_SMOOTHING_DELAY_MS }: SmoothTextOptions = {},
): AsyncGenerator<SSEEvent> {
  let buffer = "";
  let pending: TextDeltaEvent | null = null;

  function* flush() {
    if (pending && buffer.length > 0) {
      yield { ...pending, delta: buffer };
      buffer = "";
    }
  }

  for await (const event of events) {
    if (event.type !== "text-delta") {
      yield* flush();
      yield event;
      continue;
    }

    // A different text block can't share this buffer.
    if (pending && pending.id !== event.id) {
      yield* flush();
    }

    buffer += event.delta;
    pending = event;

    let word = takeWord(buffer);
    while (word !== null) {
      yield { ...pending, delta: word };
      buffer = buffer.slice(word.length);
      await wait(delayInMs);
      word = takeWord(buffer);
    }
  }

  yield* flush();
}
