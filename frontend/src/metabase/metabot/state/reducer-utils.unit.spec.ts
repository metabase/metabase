import { produce } from "immer";

import {
  appendChainReasoning,
  closeChain,
  createConversation,
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
});
