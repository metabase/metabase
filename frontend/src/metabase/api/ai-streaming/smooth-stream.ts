import type {
  ReasoningDeltaEvent,
  SSEEvent,
  TextDeltaEvent,
} from "./sse-types";

// Whitespace-terminated, so a word only emits once it's complete.
const WORD_PATTERN = /\S+\s+/m;

const DEFAULT_SMOOTHING_DELAY_MS = 10;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const takeWord = (buffer: string) => {
  const match = WORD_PATTERN.exec(buffer);
  return match ? buffer.slice(0, match.index + match[0].length) : null;
};

// text and reasoning deltas share the same {id, delta} shape and both benefit
// from steady word-pacing — provider reasoning summaries arrive especially bursty
type SmoothableDelta = TextDeltaEvent | ReasoningDeltaEvent;

const isSmoothable = (event: SSEEvent): event is SmoothableDelta =>
  event.type === "text-delta" || event.type === "reasoning-delta";

export type SmoothTextOptions = { delayInMs?: number };

// Re-emits text/reasoning deltas one word at a time on a fixed cadence, so they
// render at a steady pace however unevenly the server chunks them. Awaiting
// between words backpressures the stream, which is what paces it. Any other event
// (including switching between text and reasoning, or a new block id) flushes the
// buffered tail first to preserve ordering.
export async function* smoothStreamEvents(
  events: AsyncIterable<SSEEvent>,
  { delayInMs = DEFAULT_SMOOTHING_DELAY_MS }: SmoothTextOptions = {},
): AsyncGenerator<SSEEvent> {
  let buffer = "";
  let pending: SmoothableDelta | null = null;

  function* flush() {
    if (pending && buffer.length > 0) {
      yield { ...pending, delta: buffer };
      buffer = "";
    }
  }

  for await (const event of events) {
    if (!isSmoothable(event)) {
      yield* flush();
      yield event;
      continue;
    }

    // a different block — or switching between text and reasoning — can't share
    // this buffer
    if (pending && (pending.type !== event.type || pending.id !== event.id)) {
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
