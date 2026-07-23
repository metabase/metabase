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
