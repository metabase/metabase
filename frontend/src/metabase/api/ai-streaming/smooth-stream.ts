import type {
  ReasoningDeltaEvent,
  SSEEvent,
  TextDeltaEvent,
} from "./sse-types";

// whitespace-terminated, so a word only emits once it's complete
const WORD_PATTERN = /\S+\s+/m;

const DEFAULT_SMOOTHING_DELAY_MS = 10;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Browsers slow timers in hidden tabs: a wait can take one second or more.
// https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#timeouts_in_inactive_tabs
// One wait per word then delays the stream by minutes, so a hidden tab does not pace the text.
// Outside a browser, `document` does not exist, and the text is paced.
const isDocumentHidden = () =>
  typeof document !== "undefined" && document.hidden;

const takeWord = (buffer: string) => {
  const match = WORD_PATTERN.exec(buffer);
  return match ? buffer.slice(0, match.index + match[0].length) : null;
};

type SmoothableDelta = TextDeltaEvent | ReasoningDeltaEvent;

const isSmoothable = (event: SSEEvent): event is SmoothableDelta =>
  event.type === "text-delta" || event.type === "reasoning-delta";

export type SmoothTextOptions = { delayInMs?: number };

// Re-emits text/reasoning deltas one word at a time on a fixed cadence, so they
// render steadily however unevenly the server chunks them. Awaiting between words
// backpressures the stream, which is what paces it. While the document is hidden,
// it emits the whole buffer at once and starts no new wait.
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
    // any other event flushes the buffered tail first, to preserve ordering
    if (!isSmoothable(event)) {
      yield* flush();
      yield event;
      continue;
    }

    // a different block — or switching between text and reasoning — can't share this buffer
    if (pending && (pending.type !== event.type || pending.id !== event.id)) {
      yield* flush();
    }

    buffer += event.delta;
    pending = event;

    let word = takeWord(buffer);
    while (word !== null && !isDocumentHidden()) {
      yield { ...pending, delta: word };
      buffer = buffer.slice(word.length);
      if (isDocumentHidden()) {
        break;
      }
      await wait(delayInMs);
      word = takeWord(buffer);
    }

    if (isDocumentHidden()) {
      yield* flush();
    }
  }

  yield* flush();
}
