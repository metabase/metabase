import userEvent from "@testing-library/user-event";

import { waitFor } from "__support__/ui";

import {
  enterChatMessage,
  forkButton,
  lastChatMessage,
  mockAgentEndpoint,
  mockForkEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "./utils";

const forkedConversation = {
  conversation_id: "forked-convo-id",
  created_at: "2026-01-01T00:00:00Z",
  title: "Who is your favorite? (forked)",
  user_id: 1,
  state: {},
  messages: [
    {
      id: "m1",
      role: "user",
      type: "text",
      message: "Who is your favorite?",
      externalId: "u1",
    },
    {
      id: "m2",
      role: "agent",
      type: "text",
      message: "You, but don't tell anyone.",
      externalId: "msg_test_favorite",
      finished: true,
    },
  ],
};

const setupWithReply = async () => {
  const { store } = setup();
  mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

  await enterChatMessage("Who is your favorite?");
  const lastMessage = (await lastChatMessage())!;

  return { store, lastMessage };
};

const undoMessages = (store: ReturnType<typeof setup>["store"]) =>
  store.getState().undo.map((undo) => undo.message);

describe("metabot > fork", () => {
  it("forks the conversation from an assistant message", async () => {
    const { store, lastMessage } = await setupWithReply();
    const forkEndpoint = mockForkEndpoint(forkedConversation);

    await userEvent.click(await forkButton(lastMessage));

    await waitFor(() => expect(forkEndpoint.calls()).toHaveLength(1));
    const call = forkEndpoint.calls()[0];
    expect(call.url).toMatch(/\/api\/metabot\/conversations\/.+\/fork$/);
    expect(await call.request?.json()).toEqual({
      message_id: "msg_test_favorite",
    });

    await waitFor(() =>
      expect(
        store.getState().metabot.conversations.omnibot?.conversationId,
      ).toBe("forked-convo-id"),
    );
    expect(undoMessages(store)).toContain("Conversation forked");
  });

  it("shows an error toast and keeps the original conversation when forking fails", async () => {
    const { store, lastMessage } = await setupWithReply();
    const originalConversationId =
      store.getState().metabot.conversations.omnibot?.conversationId;
    mockForkEndpoint({}, 400);

    await userEvent.click(await forkButton(lastMessage));

    await waitFor(() =>
      expect(undoMessages(store)).toContain("Failed to fork conversation"),
    );
    expect(store.getState().metabot.conversations.omnibot?.conversationId).toBe(
      originalConversationId,
    );
  });
});
