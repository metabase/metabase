import userEvent from "@testing-library/user-event";

import { getMetabotRequestState } from "metabase-enterprise/metabot/state";

import {
  assertConversation,
  createMockReadableStream,
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
      stream: createMockReadableStream(
        (async function* () {
          yield `2:{"type":"state","version":1,"value":{"queries":{}}}\n`;
          expect(getConvoReqState()).toEqual({});
          yield `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`;
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
      textChunks: [
        `2:{"type":"state","version":1,"value":{"queries":{}}}`,
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
      textChunks: [
        `0:"here ya go"`,
        `2:{"type":"state","version":1,"value":{"testing":123}}`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
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
      stream: createMockReadableStream(
        (async function* () {
          yield `0:"blah blah blah"\n`;
          await pause1.promise;
          yield `0:"something something"\n`;
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

  it("should use new state object if aborted response contained one", async () => {
    const { store } = setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockReadableStream(
        (async function* () {
          yield `2:{"type":"state","version":1,"value":{"testing":123}}`;
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
