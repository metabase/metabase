import { produce } from "immer";

import {
  addChainTool,
  appendChainReasoning,
  closeChain,
  createConversation,
  endChainTool,
  openChain,
  startChainReasoning,
} from "./reducer-utils";
import type { MetabotConverstationState } from "./types";

const chainOf = (convo: MetabotConverstationState) =>
  convo.messages.find((m) => m.type === "chain_of_thought");

describe("chain of thought duration timing", () => {
  it("stamps and advances endedAtMs on each step so the span lives in redux", () => {
    const opened = produce(createConversation("omnibot"), (d) => openChain(d));
    const started = produce(opened, (d) => startChainReasoning(d, 1000));
    expect(chainOf(started)).toMatchObject({
      startedAtMs: 1000,
      endedAtMs: 1000,
    });

    const advanced = produce(started, (d) =>
      appendChainReasoning(d, "hi", 4000),
    );
    expect(chainOf(advanced)?.endedAtMs).toBe(4000);

    const closed = produce(advanced, (d) => closeChain(d, 5000));
    expect(chainOf(closed)?.endedAtMs).toBe(5000);
  });

  it("keeps the last step's end time when the answer closes the chain without a clock", () => {
    const convo = produce(createConversation("omnibot"), (d) => {
      openChain(d);
      startChainReasoning(d, 1000);
      appendChainReasoning(d, "x", 3000);
      closeChain(d); // e.g. a data-part answer arrives with no nowMs
    });
    expect(chainOf(convo)?.endedAtMs).toBe(3000);
  });

  it("drops a shell that never gathered a step at turn teardown", () => {
    const convo = produce(createConversation("omnibot"), (d) => {
      openChain(d);
      closeChain(d);
    });
    expect(chainOf(convo)).toBeUndefined();
    expect(convo.activeChainId).toBeUndefined();
  });

  it("advances endedAtMs when a tool ends, so a turn ending on a tool counts its runtime", () => {
    const convo = produce(createConversation("omnibot"), (d) => {
      addChainTool(d, { id: "t1", name: "analyze_data", nowMs: 1000 });
      endChainTool(d, "t1", 9000);
    });
    expect(chainOf(convo)).toMatchObject({
      startedAtMs: 1000,
      endedAtMs: 9000,
    });
  });

  it("leaves a settled chain's span alone when its tool ends late", () => {
    const convo = produce(createConversation("omnibot"), (d) => {
      addChainTool(d, { id: "t1", name: "analyze_data", nowMs: 1000 });
      closeChain(d, 2000); // answer text settled the chain
      endChainTool(d, "t1", 9000);
    });
    expect(chainOf(convo)?.endedAtMs).toBe(2000);
  });
});

describe("chain tool step dedupe", () => {
  it("updates the existing step across a closed chain instead of re-adding it", () => {
    const convo = produce(createConversation("omnibot"), (d) => {
      // tool-input-start, then answer text closes the chain, then
      // tool-input-available arrives late with the title
      addChainTool(d, { id: "t1", name: "search", nowMs: 1000 });
      closeChain(d, 2000);
      addChainTool(d, { id: "t1", name: "search", title: "revenue" });
    });
    const chains = convo.messages.filter((m) => m.type === "chain_of_thought");
    expect(chains).toHaveLength(1);
    expect(chains[0].steps).toEqual([
      expect.objectContaining({ kind: "tool", id: "t1", title: "revenue" }),
    ]);
    expect(convo.activeChainId).toBeUndefined();
  });
});
