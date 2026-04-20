import userEvent from "@testing-library/user-event";

import { getMetabotRequestState } from "metabase/metabot/state";

import {
  assertConversation,
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  erroredResponse,
  mockAgentEndpoint,
  setup,
  stopResponseButton,
} from "./utils";

describe("metabot > convo state", () => {
  it("should update the convo state on a successful request", async () => {
    const { store } = setup();
    const getConvoReqState = () =>
      getMetabotRequestState(store.getState(), "omnibot");

    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "data-state", id: "d1", data: { queries: {} } };
          expect(getConvoReqState()).toEqual({});
          yield { type: "finish" };
          yield "[DONE]";
        })(),
      ),
    });

    expect(getConvoReqState()).toEqual({});
    await enterChatMessage("Request");
    expect(getConvoReqState()).toEqual({ queries: {} });
  });

  it("should not update the convo state on a failed request", async () => {
    const { store } = setup();
    const getConvoReqState = () =>
      getMetabotRequestState(store.getState(), "omnibot");

    mockAgentEndpoint({
      events: [
        { type: "data-state", id: "d1", data: { queries: {} } },
        ...erroredResponse,
      ],
    });

    expect(getConvoReqState()).toEqual({});
    await enterChatMessage("Request");
    expect(getConvoReqState()).toEqual({});
  });

  it("should preserve conversation state if aborted response didn't contain a state data object", async () => {
    const { store } = setup();
    const getConvoReqState = () =>
      getMetabotRequestState(store.getState(), "omnibot");

    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "here ya go" },
        { type: "text-end", id: "t1" },
        { type: "data-state", id: "d1", data: { testing: 123 } },
      ],
    });
    await enterChatMessage("gimme state plz");
    assertConversation([
      ["user", "gimme state plz"],
      ["agent", "here ya go"],
    ]);
    expect(getConvoReqState()).toEqual({ testing: 123 });

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "text-start", id: "t1" };
          yield { type: "text-delta", id: "t1", delta: "blah blah blah" };
          yield { type: "text-end", id: "t1" };
          await pause1.promise;
          yield { type: "text-start", id: "t2" };
          yield { type: "text-delta", id: "t2", delta: "something something" };
          yield { type: "text-end", id: "t2" };
        })(),
      ),
    });

    await enterChatMessage("i'm going to cancel this request...");
    assertConversation([
      ["user", "gimme state plz"],
      ["agent", "here ya go"],
      ["user", "i'm going to cancel this request..."],
      ["agent", "blah blah blah"],
    ]);
    await userEvent.click(await stopResponseButton());
    pause1.resolve();

    expect(getConvoReqState()).toEqual({ testing: 123 });
  });

  // TODO (Sloan 2026-04-13): pipeThrough buffering in Jest/jsdom causes SSE events
  // to not flush before abort fires. Works correctly in production and outside Jest.
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("should use new state object if aborted response contained one", async () => {
    const { store } = setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "data-state", id: "d1", data: { testing: 123 } };
          await pause1.promise;
        })(),
      ),
    });
    await enterChatMessage("hi");
    await userEvent.click(await stopResponseButton());
    const reqState = getMetabotRequestState(store.getState(), "omnibot");
    expect(reqState).toEqual({ testing: 123 });
  });
});
