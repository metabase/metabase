import { smoothStreamEvents } from "./smooth-stream";
import type { SSEEvent } from "./sse-types";

async function* asAsyncIterable(events: SSEEvent[]) {
  for (const event of events) {
    yield event;
  }
}

const smooth = async (events: SSEEvent[]) => {
  const out: SSEEvent[] = [];
  for await (const event of smoothStreamEvents(asAsyncIterable(events), {
    delayInMs: 0,
  })) {
    out.push(event);
  }
  return out;
};

const deltasOfType = (events: SSEEvent[], type: string) =>
  events.flatMap((event) =>
    event.type === type && "delta" in event ? [event.delta] : [],
  );

const textDeltas = (events: SSEEvent[]) => deltasOfType(events, "text-delta");

describe("smoothStreamEvents", () => {
  it("emits buffered text one word at a time", async () => {
    const out = await smooth([
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "hello there world" },
      { type: "text-end", id: "t1" },
    ]);

    expect(textDeltas(out)).toEqual(["hello ", "there ", "world"]);
  });

  it("flushes the buffered tail before a non-text event", async () => {
    const out = await smooth([
      { type: "text-delta", id: "t1", delta: "done " },
      { type: "text-delta", id: "t1", delta: "tail" },
      { type: "data-state", data: {} },
    ]);

    expect(textDeltas(out)).toEqual(["done ", "tail"]);
    expect(out.at(-1)).toEqual({ type: "data-state", data: {} });
  });

  it("flushes when a delta from a new text id arrives", async () => {
    const out = await smooth([
      { type: "text-delta", id: "t1", delta: "first" },
      { type: "text-delta", id: "t2", delta: "second " },
      { type: "text-end", id: "t2" },
    ]);

    expect(out).toEqual([
      { type: "text-delta", id: "t1", delta: "first" },
      { type: "text-delta", id: "t2", delta: "second " },
      { type: "text-end", id: "t2" },
    ]);
  });

  it("word-paces reasoning deltas too, preserving their type and id", async () => {
    const out = await smooth([
      { type: "reasoning-start", id: "r1" },
      { type: "reasoning-delta", id: "r1", delta: "thinking it over" },
      { type: "reasoning-end", id: "r1" },
    ]);

    expect(deltasOfType(out, "reasoning-delta")).toEqual([
      "thinking ",
      "it ",
      "over",
    ]);
    expect(out.every((e) => e.type !== "text-delta")).toBe(true);
  });

  it("flushes the reasoning buffer before switching to text", async () => {
    const out = await smooth([
      { type: "reasoning-delta", id: "r1", delta: "reasoned" },
      { type: "text-delta", id: "t1", delta: "answer " },
      { type: "text-end", id: "t1" },
    ]);

    expect(deltasOfType(out, "reasoning-delta")).toEqual(["reasoned"]);
    expect(textDeltas(out)).toEqual(["answer "]);
  });
});

describe("smoothStreamEvents (hidden document)", () => {
  const realSetTimeout = global.setTimeout;
  let isHidden = false;

  beforeEach(() => {
    isHidden = false;
    jest.spyOn(document, "hidden", "get").mockImplementation(() => isHidden);
    jest.spyOn(global, "setTimeout");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("emits the whole buffer as one delta, with no wait", async () => {
    isHidden = true;

    const out = await smooth([
      { type: "text-delta", id: "t1", delta: "alpha beta gam" },
      { type: "text-end", id: "t1" },
    ]);

    expect(textDeltas(out)).toEqual(["alpha beta gam"]);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it("flushes the rest of the buffer when the document hides mid-delta", async () => {
    const out: SSEEvent[] = [];
    const events = smoothStreamEvents(
      asAsyncIterable([
        { type: "text-delta", id: "t1", delta: "one two three four " },
      ]),
      { delayInMs: 0 },
    );

    for await (const event of events) {
      out.push(event);
      isHidden = true;
    }

    expect(textDeltas(out)).toEqual(["one ", "two three four "]);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it("flushes the rest of the buffer when the document hides during a wait", async () => {
    jest.mocked(setTimeout).mockImplementationOnce((callback, ms) => {
      isHidden = true;
      return realSetTimeout(callback, ms);
    });

    const out = await smooth([
      { type: "text-delta", id: "t1", delta: "one two three four " },
    ]);

    expect(textDeltas(out)).toEqual(["one ", "two three four "]);
    expect(setTimeout).toHaveBeenCalledTimes(1);
  });

  it("resumes pacing when the document is visible again", async () => {
    async function* hideThenShow(): AsyncGenerator<SSEEvent> {
      isHidden = true;
      yield { type: "text-delta", id: "t1", delta: "a b c " };
      isHidden = false;
      yield { type: "text-delta", id: "t1", delta: "d e " };
    }

    const out: SSEEvent[] = [];
    for await (const event of smoothStreamEvents(hideThenShow(), {
      delayInMs: 0,
    })) {
      out.push(event);
    }

    expect(textDeltas(out)).toEqual(["a b c ", "d ", "e "]);
  });

  it("keeps event order and passes non-text events through while hidden", async () => {
    isHidden = true;
    const events: SSEEvent[] = [
      { type: "reasoning-start", id: "r1" },
      { type: "reasoning-delta", id: "r1", delta: "let me " },
      { type: "reasoning-delta", id: "r1", delta: "check the table " },
      { type: "reasoning-end", id: "r1" },
      { type: "tool-input-start", toolCallId: "c1", toolName: "search" },
      {
        type: "tool-input-available",
        toolCallId: "c1",
        toolName: "search",
        input: {},
      },
      { type: "text-delta", id: "t1", delta: "Here is the answer." },
      { type: "data-state", data: {} },
    ];

    const out = await smooth(events);

    expect(out).toEqual(events);
    expect(setTimeout).not.toHaveBeenCalled();
  });
});
