import userEvent from "@testing-library/user-event";
import { assocIn } from "icepick";

import { screen, waitFor } from "__support__/ui";
import {
  getMetabotConversationId,
  getMetabotVisible,
} from "metabase/metabot/state";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import {
  createMockMetabotConversation,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  enterChatMessage,
  mockAgentEndpoint,
  setup,
  whoIsYourFavoriteResponse,
} from "../../tests/utils";

import { MetabotAsk } from "./MetabotAsk";

const greetingTitle =
  /What would you like to know\?|What do you want to explore\?|What are you looking to learn\?/;

type SetupOpts = Exclude<Parameters<typeof setup>[0], void>;

const setupMetabotAsk = (options?: Omit<SetupOpts, "ui">) =>
  setup({ ...options, ui: <MetabotAsk /> });

// The history control lives in the chat header, which only renders once the ask
// conversation has messages (i.e. past the greeting).
const askStateWithMessage = () => {
  const state = getMetabotInitialState();
  const ask = state.conversations.ask;
  if (!ask) {
    throw new Error("Expected ask conversation");
  }
  ask.messages.push({
    id: "seed-message",
    role: "user",
    type: "text",
    message: "Earlier question",
  });
  return state;
};

describe("MetabotAsk", () => {
  it("shows the greeting and closes the global Metabot sidebar", async () => {
    const metabotInitialState = assocIn(
      getMetabotInitialState(),
      ["conversations", "omnibot", "visible"],
      true,
    );

    const { store } = setupMetabotAsk({
      metabotInitialState,
      promptSuggestions: [{ prompt: "Show me all orders" }],
    });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();
    expect(await screen.findByText("Show me all orders")).toBeInTheDocument();
    expect(screen.getByTestId("metabot-chat-input")).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-conversation-title"),
    ).not.toBeInTheDocument();
    expect(getMetabotVisible(store.getState(), "omnibot")).toBe(false);
  });

  it("replaces the greeting with the conversation after sending a message", async () => {
    setupMetabotAsk();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();

    await enterChatMessage("Who is your favorite?");

    expect(
      await screen.findByText("Who is your favorite?"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
    expect(screen.queryByText(greetingTitle)).not.toBeInTheDocument();
  });

  it("replaces the untitled placeholder with the generated title", async () => {
    setupMetabotAsk();
    mockAgentEndpoint({
      events: [{ type: "data-conversation-title", data: "Orders by Month" }],
    });

    await enterChatMessage("Show orders by month");

    expect(
      await screen.findByTestId("metabot-conversation-title"),
    ).toHaveTextContent("Orders by Month");
  });

  it("shows the AI provider setup notice in the greeting when not configured", async () => {
    setupMetabotAsk({
      currentUser: createMockUser({ is_superuser: true }),
      isConfigured: false,
    });

    expect(
      await screen.findByText("To use AI exploration, please", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("metabot-chat-input")).not.toBeInTheDocument();
  });

  it("shows the conversation history control on the greeting", async () => {
    setupMetabotAsk();

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();
    expect(
      await screen.findByTestId("metabot-conversation-history"),
    ).toBeInTheDocument();
  });

  it("shows the conversation history control in the chat header", async () => {
    setupMetabotAsk({ metabotInitialState: askStateWithMessage() });

    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
    expect(
      await screen.findByTestId("metabot-conversation-history"),
    ).toBeInTheDocument();
  });

  it("does not show the conversation history control when not configured", async () => {
    setupMetabotAsk({ isConfigured: false });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-conversation-history"),
    ).not.toBeInTheDocument();
  });

  it("does not show the conversation history control for a non-internal/nlq profile", async () => {
    const state = getMetabotInitialState();
    const ask = state.conversations.ask;
    if (!ask) {
      throw new Error("Expected ask conversation");
    }
    ask.profileOverride = "sql";

    setupMetabotAsk({ metabotInitialState: state });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-conversation-history"),
    ).not.toBeInTheDocument();
  });

  it("navigates to the conversation route after the first message", async () => {
    const { store, history } = setupMetabotAsk({
      withRouter: true,
      initialRoute: "/question/ask",
    });
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    const askId = getMetabotConversationId(store.getState(), "ask");

    await enterChatMessage("Who is your favorite?");

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe(
        `/metabot/conversation/${askId}`,
      );
    });
  });

  it("navigates to the selected conversation from history", async () => {
    const { history } = setupMetabotAsk({
      withRouter: true,
      initialRoute: "/question/ask",
      conversations: [
        createMockMetabotConversation({
          conversation_id: "past-conversation-id",
          title: "Earlier question",
        }),
      ],
    });

    await userEvent.click(
      await screen.findByTestId("metabot-conversation-history"),
    );
    await userEvent.click(await screen.findByText("Earlier question"));

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe(
        "/metabot/conversation/past-conversation-id",
      );
    });
  });
});
