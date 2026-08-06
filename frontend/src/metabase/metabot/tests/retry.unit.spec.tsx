import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import { assocIn } from "icepick";

import { act, screen, waitFor, within } from "__support__/ui";
import type { SSEEvent } from "metabase/api/ai-streaming/sse-types";
import {
  getMessages,
  getMetabotConversation,
  getMetabotRequestState,
  retryPrompt,
  submitInput,
} from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import type { State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { isUuid } from "metabase/utils/uuid";

import {
  chatMessages,
  createMockSSEStream,
  createPauses,
  enterChatMessage,
  lastChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  stopResponseButton,
  whoIsYourFavoriteResponse,
} from "./utils";

const emptyContext = {
  user_is_viewing: [],
  current_time_with_timezone: "",
  capabilities: [],
};

const turnEvents = (opts: {
  messageId: string;
  userMessageId?: string;
  text: string;
}): SSEEvent[] => [
  {
    type: "start",
    messageId: opts.messageId,
    ...(opts.userMessageId
      ? { messageMetadata: { userMessageId: opts.userMessageId } }
      : {}),
  },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: opts.text },
  { type: "text-end", id: "t1" },
  { type: "finish", finishReason: "stop" },
];

describe("metabot > retry", () => {
  it("should present the user an option to retry a response", async () => {
    setup();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");
    const lastMessage = await lastChatMessage();
    expect(lastMessage).toHaveTextContent(/You, but don't tell anyone./);
    expect(
      await within(lastMessage!).findByTestId("metabot-chat-message-retry"),
    ).toBeInTheDocument();
  });

  it("should reuse the conversation profileOverride when retrying a response", async () => {
    const metabotInitialState = assocIn(
      assocIn(
        getMetabotInitialState(),
        ["conversations", "omnibot", "visible"],
        true,
      ),
      ["conversations", "omnibot", "profileOverride"],
      "nlq",
    );
    setup({ metabotInitialState });

    const firstSpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        userMessageId: "user_msg_1",
        text: "first reply",
      }),
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText("first reply")).toBeInTheDocument();
    expect((await lastReqBody(firstSpy)).profile_id).toBe("nlq");

    const retrySpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_2",
        userMessageId: "user_msg_1",
        text: "regenerated reply",
      }),
    });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const retryBody = await lastReqBody(retrySpy);
    expect(retryBody.profile_id).toBe("nlq");
    expect(retryBody.retry_message_id).toBe("user_msg_1");
  });

  it("should send an explicit profile on both the original prompt and the retry", async () => {
    const { store } = setup();
    // renderWithProviders types dispatch as plain Dispatch; RTK thunks need ThunkDispatch
    const dispatch = store.dispatch as ThunkDispatch<
      State,
      void,
      UnknownAction
    >;

    const firstSpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        userMessageId: "user_msg_1",
        text: "first reply",
      }),
    });
    act(() => {
      dispatch(
        submitInput({
          type: "text",
          message: "first prompt",
          context: emptyContext,
          agentId: "explorations",
          profile: "explorations",
        }),
      );
    });
    expect((await lastReqBody(firstSpy)).profile_id).toBe("explorations");

    const messageId = checkNotNull(
      getMessages(store.getState(), "explorations").at(-1),
    ).id;

    const retrySpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_2",
        userMessageId: "user_msg_1",
        text: "regenerated reply",
      }),
    });
    act(() => {
      dispatch(
        retryPrompt({
          messageId,
          context: emptyContext,
          agentId: "explorations",
          profile: "explorations",
        }),
      );
    });

    const retryBody = await lastReqBody(retrySpy);
    expect(retryBody.profile_id).toBe("explorations");
    expect(retryBody.retry_message_id).toBe("user_msg_1");
  });

  it("should show retry option for error messages", async () => {
    setup();

    mockAgentEndpoint({
      events: [
        { type: "error", errorText: "Anthropic API key expired or invalid" },
      ],
    });

    await enterChatMessage("Who is your favorite?");

    const lastMessage = await lastChatMessage();
    expect(lastMessage).toHaveTextContent(/Something went wrong/);
    expect(
      within(lastMessage!).getByTestId("metabot-chat-message-retry"),
    ).toBeInTheDocument();
  });

  it("should only offer retry on the last turn", async () => {
    setup();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });
    await enterChatMessage("Who is your favorite?");
    expect(
      await screen.findByText("You, but don't tell anyone."),
    ).toBeInTheDocument();

    mockAgentEndpoint({
      events: [
        { type: "start", messageId: "msg_second" },
        { type: "text-start", id: "t9" },
        { type: "text-delta", id: "t9", delta: "Still you." },
        { type: "text-end", id: "t9" },
        { type: "finish", finishReason: "stop" },
      ],
    });
    await enterChatMessage("Are you sure?");
    expect(await screen.findByText("Still you.")).toBeInTheDocument();

    const [, firstTurnReply, , lastTurnReply] = await chatMessages();
    expect(
      within(lastTurnReply).getByTestId("metabot-chat-message-retry"),
    ).toBeInTheDocument();
    expect(
      within(firstTurnReply).queryByTestId("metabot-chat-message-retry"),
    ).not.toBeInTheDocument();
  });

  it("should successfully rewind a response", async () => {
    setup();
    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t0" },
        { type: "text-delta", id: "t0", delta: "Let me think..." },
        { type: "text-end", id: "t0" },
        ...whoIsYourFavoriteResponse,
      ],
    });
    await enterChatMessage("Who is your favorite?");

    const beforeMessages = await screen.findByTestId("metabot-chat-messages");
    expect(beforeMessages).toHaveTextContent(/Let me think.../);
    expect(beforeMessages).toHaveTextContent(/You, but don't tell anyone./);

    mockAgentEndpoint({
      events: [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "The answer is always you." },
        { type: "text-end", id: "t1" },
        { type: "data-state", data: { queries: {} } },
        { type: "finish", finishReason: "stop" },
      ],
    });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const afterMessages = await screen.findByTestId("metabot-chat-messages");

    expect(afterMessages).not.toHaveTextContent(/Let me think.../);
    expect(afterMessages).not.toHaveTextContent(/You, but don't tell anyone./);
    expect(afterMessages).toHaveTextContent(/The answer is always you./);
  });

  it("should rewind convo state to before the retried turn", async () => {
    const { store } = setup();
    const getConvoReqState = () =>
      getMetabotRequestState(store.getState(), "omnibot");

    mockAgentEndpoint({
      events: [
        ...turnEvents({
          messageId: "msg_1",
          userMessageId: "user_msg_1",
          text: "first reply",
        }).slice(0, -1),
        { type: "data-state", data: { todos: [{ id: "a" }] } },
        { type: "finish", finishReason: "stop" },
      ],
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText("first reply")).toBeInTheDocument();
    expect(getConvoReqState()).toEqual({ todos: [{ id: "a" }] });

    mockAgentEndpoint({
      events: [
        ...turnEvents({
          messageId: "msg_2",
          userMessageId: "user_msg_2",
          text: "second reply",
        }).slice(0, -1),
        { type: "data-state", data: { todos: [{ id: "b" }] } },
        { type: "finish", finishReason: "stop" },
      ],
    });
    await enterChatMessage("second prompt");
    expect(await screen.findByText("second reply")).toBeInTheDocument();
    expect(getConvoReqState()).toEqual({ todos: [{ id: "b" }] });

    // the retried turn's response carries no state part, so the pre-turn
    // snapshot is what the convo is left with
    mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_3",
        userMessageId: "user_msg_2",
        text: "regenerated reply",
      }),
    });
    const messages = await chatMessages();
    await userEvent.click(
      await within(messages.at(-1)!).findByTestId("metabot-chat-message-retry"),
    );
    expect(await screen.findByText("regenerated reply")).toBeInTheDocument();
    expect(getConvoReqState()).toEqual({ todos: [{ id: "a" }] });
  });

  it("should stamp the user message with the start event's userMessageId", async () => {
    const { store } = setup();
    mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        userMessageId: "user_msg_1",
        text: "hello!",
      }),
    });

    await enterChatMessage("hi");
    expect(await screen.findByText("hello!")).toBeInTheDocument();

    const convo = getMetabotConversation(store.getState(), "omnibot");
    expect(convo.messages.find((m) => m.role === "user")).toMatchObject({
      externalId: "user_msg_1",
    });
  });

  it("should send retry_message_id and no parent_message_id when retrying the last turn", async () => {
    setup();
    mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        userMessageId: "user_msg_1",
        text: "first reply",
      }),
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText("first reply")).toBeInTheDocument();

    mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_2",
        userMessageId: "user_msg_2",
        text: "second reply",
      }),
    });
    await enterChatMessage("second prompt");
    expect(await screen.findByText("second reply")).toBeInTheDocument();

    const retrySpy = mockAgentEndpoint({ events: [] });
    const messages = await chatMessages();
    await userEvent.click(
      await within(messages.at(-1)!).findByTestId("metabot-chat-message-retry"),
    );

    const body = await lastReqBody(retrySpy);
    expect(body.retry_message_id).toBe("user_msg_2");
    expect(body.user_message_id).toBe("user_msg_2");
    expect(body.parent_message_id).toBeUndefined();
    expect(body.message).toBe("second prompt");
  });

  it("should send retry_message_id when retrying an errored turn", async () => {
    setup();
    mockAgentEndpoint({
      events: [
        {
          type: "start",
          messageId: "msg_err",
          messageMetadata: { userMessageId: "user_msg_err" },
        },
        { type: "error", errorText: "boom" },
      ],
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();

    const retrySpy = mockAgentEndpoint({ events: [] });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const body = await lastReqBody(retrySpy);
    expect(body.retry_message_id).toBe("user_msg_err");
    expect(body.parent_message_id).toBeUndefined();
  });

  it("should send retry_message_id when retrying an aborted turn", async () => {
    setup();
    const [pause] = createPauses(1);
    mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield {
            type: "start",
            messageId: "msg_aborted",
            messageMetadata: { userMessageId: "user_msg_aborted" },
          };
          yield { type: "text-start", id: "t1" };
          yield { type: "text-delta", id: "t1", delta: "Let me think" };
          await pause.promise;
        })(),
      ),
    });
    await enterChatMessage("first prompt");
    await userEvent.click(await stopResponseButton());
    pause.resolve();
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-stop-response"),
      ).not.toBeInTheDocument();
    });

    const retrySpy = mockAgentEndpoint({ events: [] });
    await userEvent.click(
      (await screen.findAllByTestId("metabot-chat-message-retry"))[0],
    );

    const body = await lastReqBody(retrySpy);
    expect(body.retry_message_id).toBe("user_msg_aborted");
  });

  it("should retry with the minted user id when aborted before the start event", async () => {
    setup();
    const [pause] = createPauses(1);
    const firstSpy = mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield* [];
          await pause.promise;
        })(),
      ),
    });
    await enterChatMessage("first prompt");
    await userEvent.click(await stopResponseButton());
    pause.resolve();
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-stop-response"),
      ).not.toBeInTheDocument();
    });
    const firstReqBody = await lastReqBody(firstSpy);

    const retrySpy = mockAgentEndpoint({ events: [] });
    await userEvent.click(
      (await screen.findAllByTestId("metabot-chat-message-retry"))[0],
    );

    const body = await lastReqBody(retrySpy);
    expect(isUuid(firstReqBody.user_message_id)).toBe(true);
    expect(body.retry_message_id).toBe(firstReqBody.user_message_id);
  });

  it("should fall back to a plain send when the failed turn has no userMessageId", async () => {
    setup();
    mockAgentEndpoint({
      events: [{ type: "error", errorText: "boom" }],
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();

    const retrySpy = mockAgentEndpoint({ events: [] });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const body = await lastReqBody(retrySpy);
    expect(body.retry_message_id).toBeUndefined();
  });
});
