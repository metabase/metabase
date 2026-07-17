import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { waitFor } from "__support__/ui";
import {
  getMetabotConversation,
  getMetabotRequestState,
} from "metabase/metabot/state";

import {
  assertConversation,
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  erroredResponse,
  hideMetabot,
  lastReqBody,
  mockAgentEndpoint,
  resetChatButton,
  setup,
  showMetabot,
  stopResponseButton,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > convo state", () => {
  // The TipTap/ProseMirror prompt editor these tests drive processes input
  // through real timers/microtasks; the fast-test regime's frozen fake timers
  // prevent messages from ever being submitted. Opt this file back into real
  // timers.
  beforeEach(() => {
    jest.useRealTimers();
  });

  it("should update the convo state on a successful request", async () => {
    const { store } = setup();
    const getConvoReqState = () =>
      getMetabotRequestState(store.getState(), "omnibot");

    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "data-state", data: { queries: {} } };
          expect(getConvoReqState()).toEqual({});
          yield { type: "finish", finishReason: "stop" };
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
        { type: "data-state", data: { queries: {} } },
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
        { type: "data-state", data: { testing: 123 } },
        { type: "finish", finishReason: "stop" },
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
          yield { type: "text-delta", id: "t1", delta: "blah blah blah" };
          await pause1.promise;
          yield { type: "text-delta", id: "t1", delta: "something something" };
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
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "data-state", data: { testing: 123 } };
          await pause1.promise;
        })(),
      ),
    });
    await enterChatMessage("hi");
    await userEvent.click(await stopResponseButton());
    const reqState = getMetabotRequestState(store.getState(), "omnibot");
    expect(reqState).toEqual({ testing: 123 });
  });

  it("should keep the conversation thread when metabot is hidden or opened", async () => {
    const { store } = setup();
    const agentSpy = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
    });

    await enterChatMessage("Who is your favorite?");
    await waitFor(() => expect(agentSpy).toHaveBeenCalledTimes(1));

    hideMetabot(store.dispatch);
    showMetabot(store.dispatch);
    await enterChatMessage("Hi!");
    const reqBody = await lastReqBody(agentSpy);
    // the thread survives hide/show: the next request still points at the prior turn
    expect(reqBody.parent_message_id).toBe("msg_test_favorite");
  });

  it("should reset the conversation when the reset button is clicked", async () => {
    const { store } = setup();
    const getState = () => getMetabotConversation(store.getState(), "omnibot");
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");
    await assertConversation([
      ["user", "Who is your favorite?"],
      ["agent", "You, but don't tell anyone."],
    ]);

    const beforeResetState = getState();
    expect(_.omit(beforeResetState.messages[0], ["id"])).toStrictEqual({
      role: "user",
      type: "text",
      message: "Who is your favorite?",
    });
    expect(
      _.omit(beforeResetState.messages[1], ["id", "externalId"]),
    ).toStrictEqual({
      role: "agent",
      type: "text",
      message: "You, but don't tell anyone.",
    });

    await userEvent.click(await resetChatButton());

    const afterResetState = getState();
    expect(afterResetState.conversationId).not.toBe(
      beforeResetState.conversationId,
    );
    expect(afterResetState.messages).toStrictEqual([]);
  });
});
