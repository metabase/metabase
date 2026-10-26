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

export type SmoothTextOptions = {
  delayInMs?: number;
  // Returns true while the user can see the reasoning of this stream.
  shouldPaceReasoning?: () => boolean;
};

// Re-emits text deltas one word at a time on a fixed cadence, so they render
// steadily however unevenly the server chunks them. Awaiting between words
// backpressures the stream, which is what paces it. While the document is hidden,
// it emits the whole buffer at once and starts no new wait.
// Reasoning deltas are paced only while `shouldPaceReasoning` returns true.
// When it returns false, the buffered words go out at once and the reasoning
// passes through. Paced reasoning delays every later event, such as the SQL edit,
// by minutes, so it is paced only while the user can see it.
// https://github.com/metabase/metabase/issues/84969
export async function* smoothStreamEvents(
  events: AsyncIterable<SSEEvent>,
  {
    delayInMs = DEFAULT_SMOOTHING_DELAY_MS,
    shouldPaceReasoning = () => false,
  }: SmoothTextOptions = {},
): AsyncGenerator<SSEEvent> {
  let buffer = "";
  let pending: SmoothableDelta | null = null;

  const canPace = () =>
    !isDocumentHidden() &&
    (pending?.type === "text-delta" || shouldPaceReasoning());

  function* flush() {
    if (pending && buffer.length > 0) {
      yield { ...pending, delta: buffer };
      buffer = "";
    }
  }

  for await (const event of events) {
    // other events, and reasoning that is not paced, flush the buffered tail
    // first, to keep the order, and then pass through
    const isPassThrough =
      !isSmoothable(event) ||
      (event.type === "reasoning-delta" && !shouldPaceReasoning());
    if (isPassThrough) {
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
    while (word !== null && canPace()) {
      yield { ...pending, delta: word };
      buffer = buffer.slice(word.length);
      if (!canPace()) {
        break;
      }
      await wait(delayInMs);
      word = takeWord(buffer);
    }

    if (!canPace()) {
      yield* flush();
    }
  }

  yield* flush();
}
