import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import { forkConversation } from "metabase/metabot/state";
import * as Urls from "metabase/urls";

import {
  enterChatMessage,
  forkButton,
  lastChatMessage,
  mockAgentEndpoint,
  mockForkEndpoint,
  setup,
  startedThenErroredResponse,
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

describe("metabot > fork", () => {
  it("forks the conversation from an assistant message", async () => {
    const { store, lastMessage } = await setupWithReply();
    const forkEndpoint = mockForkEndpoint(forkedConversation);

    await userEvent.click(await forkButton(lastMessage));

    await waitFor(() =>
      expect(
        forkEndpoint.calls({ body: { message_id: "msg_test_favorite" } }),
      ).toHaveLength(1),
    );

    await waitFor(() =>
      expect(
        store.getState().metabot.conversations.omnibot?.conversationId,
      ).toBe("forked-convo-id"),
    );
    expect(await screen.findByText("Conversation forked")).toBeInTheDocument();
  });

  it("shows an error toast and keeps the original conversation when forking fails", async () => {
    const { store, lastMessage } = await setupWithReply();
    const originalConversationId =
      store.getState().metabot.conversations.omnibot?.conversationId;
    mockForkEndpoint({}, 400);

    await userEvent.click(await forkButton(lastMessage));

    expect(
      await screen.findByText("Failed to fork conversation"),
    ).toBeInTheDocument();
    expect(store.getState().metabot.conversations.omnibot?.conversationId).toBe(
      originalConversationId,
    );
  });

  it("navigates to the forked conversation when forking on the ask page", async () => {
    const { store, history } = setup({
      withRouter: true,
      initialRoute: "/metabot",
    });
    mockForkEndpoint(forkedConversation);

    await store.dispatch(
      forkConversation({
        agentId: "ask",
        conversationId: "original-convo-id",
        messageId: "msg_test_favorite",
      }),
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        Urls.metabotConversation("forked-convo-id"),
      ),
    );
  });

  it("does not offer to fork an errored response", async () => {
    setup();
    mockAgentEndpoint({ events: startedThenErroredResponse });

    await enterChatMessage("Who is your favorite?");

    const lastMessage = (await lastChatMessage())!;
    expect(lastMessage).toHaveTextContent(/Something went wrong/);
    expect(
      within(lastMessage).queryByTestId("metabot-chat-message-fork"),
    ).not.toBeInTheDocument();
  });
});
