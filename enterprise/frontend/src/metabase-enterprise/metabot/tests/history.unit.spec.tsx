import userEvent from "@testing-library/user-event";
import _ from "underscore";

import { act, screen, waitFor } from "__support__/ui";
import { LONG_CONVO_MSG_LENGTH_THRESHOLD } from "metabase-enterprise/metabot/constants";
import {
  addUserMessage,
  getHistory,
  getMetabotConversation,
} from "metabase-enterprise/metabot/state";

import {
  assertConversation,
  createMockReadableStream,
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
      textChunks: whoIsYourFavoriteResponse,
      waitForResponse: true,
    });
    await enterChatMessage("Who is your favorite?");
    sendResponse();
    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();

    const agentSpy = mockAgentEndpoint({
      textChunks: [],
    });
    await enterChatMessage("Hi!");
    const reqBody = await lastReqBody(agentSpy);
    expect(reqBody?.history).toEqual([
      { content: "Who is your favorite?", role: "user" },
      { content: "You, but don't tell anyone.", role: "assistant" },
    ]);
  });

  it("should not clear history when metabot is hidden or opened", async () => {
    const { store } = setup();
    const agentSpy = mockAgentEndpoint({
      textChunks: whoIsYourFavoriteResponse,
    });

    await enterChatMessage("Who is your favorite?");
    await waitFor(() => expect(agentSpy).toHaveBeenCalledTimes(1));

    hideMetabot(store.dispatch);
    showMetabot(store.dispatch);
    await enterChatMessage("Hi!");
    const lastCall = agentSpy.mock.lastCall;
    const reqBody = JSON.parse(String(lastCall?.[1]?.body));
    const sentHistory = reqBody.history;
    expect(sentHistory).not.toEqual([]);
  });

  it("should merge text chunks in the history", async () => {
    const { store } = setup();
    mockAgentEndpoint({
      textChunks: [
        `0:"You, but "`,
        `0:"don't tell anyone."`,
        `d:{"finishReason":"stop","usage":{"promptTokens":4916,"completionTokens":8}}`,
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
    mockAgentEndpoint({ textChunks: whoIsYourFavoriteResponse });

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
    expect(_.omit(beforeResetState.messages[1], ["id"])).toStrictEqual({
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
      stream: createMockReadableStream(
        (async function* () {
          yield `9:{"toolCallId":"test","toolName":"test","args":""}`;
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
        tool_calls: [{ arguments: "", id: "test", name: "test" }],
      },
      {
        content: "Tool execution interrupted by user",
        role: "tool",
        tool_call_id: "test",
      },
    ]);
  });
});
