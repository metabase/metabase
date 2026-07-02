import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { act, screen, waitFor } from "__support__/ui";
import { LONG_CONVO_MSG_LENGTH_THRESHOLD } from "metabase/metabot/constants";
import {
  addUserMessage,
  getHistory,
  getMetabotConversation,
} from "metabase/metabot/state";

import {
  assertConversation,
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  hideMetabot,
  lastReqBody,
  mockAgentEndpoint,
  resetChatButton,
  setup,
  showMetabot,
  stopResponseButton,
  whoIsYourFavoriteResponse,
} from "./utils";

describe("metabot > history", () => {
  it("should send conversation history along with future messages", async () => {
    setup();

    const { sendResponse } = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });
    await enterChatMessage("Who is your favorite?");
    sendResponse();
    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();

    const agentSpy = mockAgentEndpoint({
      events: [],
    });
    await enterChatMessage("Hi!");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.history).toEqual([
      { content: "Who is your favorite?", role: "user" },
      { content: "You, but don't tell anyone.", role: "assistant" },
    ]);
  });

  it("should omit parent_message_id for the very first message of a new conversation", async () => {
    setup();

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Who is your favorite?");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.parent_message_id).toBeUndefined();
  });

  it("should send parent_message_id matching the previous turn's external id", async () => {
    setup();

    const first = mockAgentEndpoint({
      events: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });
    await enterChatMessage("Who is your favorite?");
    first.sendResponse();
    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();

    const second = mockAgentEndpoint({
      events: [
        { type: "start", messageId: "msg_second_turn" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Sure." },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop" },
      ],
      waitForResponse: true,
    });
    await enterChatMessage("Are you sure?");
    second.sendResponse();
    expect(await screen.findByText("Sure.")).toBeInTheDocument();

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Hi again!");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.parent_message_id).toBe("msg_second_turn");
  });

  it("should send the aborted turn's message id as parent_message_id on the next message", async () => {
    setup();

    const [pause] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "start", messageId: "msg_aborted_turn" };
          yield { type: "text-start", id: "t1" };
          yield { type: "text-delta", id: "t1", delta: "Let me think" };
          await pause.promise;
        })(),
      ),
    });
    await enterChatMessage("Who is your favorite?");
    await userEvent.click(await stopResponseButton());
    pause.resolve();
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-stop-response"),
      ).not.toBeInTheDocument();
    });

    const agentSpy = mockAgentEndpoint({ events: [] });
    await enterChatMessage("Nevermind, hi!");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.parent_message_id).toBe("msg_aborted_turn");
  });

  it("should not clear history when metabot is hidden or opened", async () => {
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
    const sentHistory = reqBody.history;
    expect(sentHistory).not.toEqual([]);
  });

  it("should merge text chunks in the history", async () => {
    const { store } = setup();
    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "You, but " },
        { type: "text-delta", id: "t1", delta: "don't tell anyone." },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop" },
      ],
    });

    const initialHistory = getHistory(store.getState(), "omnibot");
    expect(initialHistory).toEqual([]);

    await enterChatMessage("Who is your favorite?");

    const finalHistory = getHistory(store.getState(), "omnibot");
    expect(finalHistory).toHaveLength(2);
    expect(finalHistory[0].role).toBe("user");
    expect(finalHistory[0].content).toBe("Who is your favorite?");
    expect(finalHistory[1].role).toBe("assistant");
    expect(finalHistory[1].content).toBe("You, but don't tell anyone.");
  });

  it("should clear history when the user hits the reset button", async () => {
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

  it("should warn the chat is getting long if the conversation is long w/ ability to clear history", async () => {
    const { store } = setup();
    const longMsg = "x".repeat(LONG_CONVO_MSG_LENGTH_THRESHOLD / 2);

    act(() => {
      store.dispatch(
        addUserMessage({
          id: "1",
          type: "text",
          message: longMsg,
          agentId: "omnibot",
        }),
      );
    });
    expect(await screen.findByText(/xxxxxxx/)).toBeInTheDocument();
    expect(
      screen.queryByText(/This chat is getting long/),
    ).not.toBeInTheDocument();

    act(() => {
      store.dispatch(
        addUserMessage({
          id: "2",
          type: "text",
          message: longMsg,
          agentId: "omnibot",
        }),
      );
    });
    expect(
      await screen.findByText(/This chat is getting long/),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("metabot-reset-long-chat"));

    await waitFor(() => {
      expect(
        screen.queryByText(/This chat is getting long/),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/xxxxxxx/)).not.toBeInTheDocument();
  });

  it("should manually insert synthetic tool results for aborted requests with unresolved tool calls", async () => {
    const { store } = setup();

    const [pause1] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield {
            type: "tool-input-available",
            toolCallId: "test",
            toolName: "test",
            input: {},
          };
          await pause1.promise;
        })(),
      ),
    });
    await enterChatMessage("hi");
    await userEvent.click(await stopResponseButton());
    pause1.resolve();
    expect(getHistory(store.getState(), "omnibot")).toMatchObject([
      { content: "hi", role: "user" },
      {
        role: "assistant",
        tool_calls: [{ arguments: "{}", id: "test", name: "test" }],
      },
      {
        content: "Tool execution interrupted by user",
        role: "tool",
        tool_call_id: "test",
      },
    ]);
  });
});
