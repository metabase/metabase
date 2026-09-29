import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
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
import type { State } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { isUuid } from "metabase/utils/uuid";

import {
  chatMessages,
  conversationIdForAgent,
  createMockSSEStream,
  createPauses,
  createTestMetabotState,
  enterChatMessage,
  expectContextUsage,
  lastChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  stopResponseButton,
  testConversationId,
  whoIsYourFavoriteResponse,
} from "./utils";

const emptyContext = {
  user_is_viewing: [],
  current_time_with_timezone: "",
  capabilities: [],
};

const CONTEXT_WINDOW = 1000;

const turnEvents = ({
  messageId,
  text,
  contextTokens,
}: {
  messageId: string;
  text: string;
  contextTokens?: number;
}): SSEEvent[] => [
  { type: "start", messageId },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
  {
    type: "finish",
    finishReason: "stop",
    ...(contextTokens != null && {
      messageMetadata: { contextTokens, contextWindowTokens: CONTEXT_WINDOW },
    }),
  },
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
      assocIn(createTestMetabotState(), ["agents", "omnibot", "visible"], true),
      ["conversations", testConversationId("omnibot"), "profileOverride"],
      "nlq",
    );
    setup({ metabotInitialState });

    const firstSpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        text: "first reply",
      }),
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText("first reply")).toBeInTheDocument();
    const firstBody = await lastReqBody(firstSpy);
    expect(firstBody.profile_id).toBe("nlq");

    const retrySpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_2",
        text: "regenerated reply",
      }),
    });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const retryBody = await lastReqBody(retrySpy);
    expect(retryBody.profile_id).toBe("nlq");
    expect(retryBody.retry_message_id).toBe(firstBody.user_message_id);
  });

  it("should send an explicit profile on both the original prompt and the retry", async () => {
    const { store } = setup();
    // renderWithProviders types dispatch as plain Dispatch; RTK thunks need ThunkDispatch
    const dispatch = store.dispatch as ThunkDispatch<
      State,
      void,
      UnknownAction
    >;
    const conversationId = conversationIdForAgent(store, "explorations");

    const firstSpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        text: "first reply",
      }),
    });
    act(() => {
      dispatch(
        submitInput({
          type: "text",
          message: "first prompt",
          context: emptyContext,
          conversationId,
          profile: "explorations",
        }),
      );
    });
    const firstBody = await lastReqBody(firstSpy);
    expect(firstBody.profile_id).toBe("explorations");

    const messageId = checkNotNull(
      getMessages(store.getState(), conversationId).at(-1),
    ).id;

    const retrySpy = mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_2",
        text: "regenerated reply",
      }),
    });
    act(() => {
      dispatch(
        retryPrompt({
          messageId,
          context: emptyContext,
          conversationId,
          profile: "explorations",
        }),
      );
    });

    const retryBody = await lastReqBody(retrySpy);
    expect(retryBody.profile_id).toBe("explorations");
    expect(retryBody.retry_message_id).toBe(firstBody.user_message_id);
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
      getMetabotRequestState(store.getState(), testConversationId("omnibot"));

    mockAgentEndpoint({
      events: [
        ...turnEvents({
          messageId: "msg_1",
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

  it("should rewind the context window usage to the retried turn", async () => {
    setup();

    mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        text: "first reply",
        contextTokens: 520,
      }),
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText("first reply")).toBeInTheDocument();
    await expectContextUsage(52);

    mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_2",
        text: "second reply",
        contextTokens: 640,
      }),
    });
    await enterChatMessage("second prompt");
    expect(await screen.findByText("second reply")).toBeInTheDocument();
    await expectContextUsage(64);

    // the regenerated turn reports no usage of its own, so 52% can only come
    // from the rewind
    mockAgentEndpoint({
      events: turnEvents({ messageId: "msg_3", text: "regenerated reply" }),
    });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );
    expect(await screen.findByText("regenerated reply")).toBeInTheDocument();
    await expectContextUsage(52);
  });

  it("should stamp the user message with the id it sent", async () => {
    const { store } = setup();
    const spy = mockAgentEndpoint({
      events: turnEvents({ messageId: "msg_1", text: "hello!" }),
    });

    await enterChatMessage("hi");
    expect(await screen.findByText("hello!")).toBeInTheDocument();

    const convo = getMetabotConversation(store.getState(), "omnibot");
    expect(convo.messages.find((t) => t.role === "user")).toMatchObject({
      externalId: (await lastReqBody(spy)).user_message_id,
    });
  });

  it("should send retry_message_id and no parent_message_id when retrying the last turn", async () => {
    setup();
    mockAgentEndpoint({
      events: turnEvents({
        messageId: "msg_1",
        text: "first reply",
      }),
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText("first reply")).toBeInTheDocument();

    const secondSpy = mockAgentEndpoint({
      events: turnEvents({ messageId: "msg_2", text: "second reply" }),
    });
    await enterChatMessage("second prompt");
    expect(await screen.findByText("second reply")).toBeInTheDocument();
    const secondBody = await lastReqBody(secondSpy);

    const retrySpy = mockAgentEndpoint({ events: [] });
    const messages = await chatMessages();
    await userEvent.click(
      await within(messages.at(-1)!).findByTestId("metabot-chat-message-retry"),
    );

    const body = await lastReqBody(retrySpy);
    expect(body.retry_message_id).toBe(secondBody.user_message_id);
    expect(body.user_message_id).toBe(secondBody.user_message_id);
    expect(body.parent_message_id).toBeUndefined();
    expect(body.message).toBe("second prompt");
  });

  it("should send retry_message_id when retrying an errored turn", async () => {
    setup();
    const firstSpy = mockAgentEndpoint({
      events: [
        { type: "start", messageId: "msg_err" },
        { type: "error", errorText: "boom" },
      ],
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    const firstBody = await lastReqBody(firstSpy);

    const retrySpy = mockAgentEndpoint({ events: [] });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const body = await lastReqBody(retrySpy);
    expect(body.retry_message_id).toBe(firstBody.user_message_id);
    expect(body.parent_message_id).toBeUndefined();
  });

  it("should send retry_message_id when retrying an aborted turn", async () => {
    setup();
    const [pause] = createPauses(1);
    const firstSpy = mockAgentEndpoint({
      stream: createMockSSEStream(
        (async function* () {
          yield { type: "start", messageId: "msg_aborted" };
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
    expect(body.retry_message_id).toBe(
      (await lastReqBody(firstSpy)).user_message_id,
    );
  });

  it("should retry with the minted user id when aborted before any response", async () => {
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

  it("should fall back to a plain send when the request failed before the server started the turn", async () => {
    setup();
    fetchMock.post(`path:/api/metabot/agent-streaming`, {
      status: 500,
      body: { message: "boom" },
    });
    await enterChatMessage("first prompt");
    expect(await screen.findByText(/boom/)).toBeInTheDocument();

    const retrySpy = mockAgentEndpoint({ events: [] });
    await userEvent.click(
      await screen.findByTestId("metabot-chat-message-retry"),
    );

    const body = await lastReqBody(retrySpy);
    expect(body.retry_message_id).toBeUndefined();
  });
});
