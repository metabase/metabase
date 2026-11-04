import userEvent from "@testing-library/user-event";
import { assocIn } from "icepick";

import {
  createMockMetabotGeneratedCardPart,
  createMockMetabotTextMessage,
  setupCardDataset,
  setupDatabaseEndpoints,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { getMetabotVisible } from "metabase/metabot/state";
import {
  createMockDatabase,
  createMockMetabotConversation,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  conversationIdForAgent,
  createTestMetabotState,
  enterChatMessage,
  erroredResponse,
  lastChatMessage,
  lastReqBody,
  mockAgentEndpoint,
  setup,
  testConversationId,
  whoIsYourFavoriteResponse,
} from "../../tests/utils";

import { MetabotAsk } from "./MetabotAsk";

jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="visualization" />,
}));

const greetingTitle =
  /What would you like to know\?|What do you want to explore\?|What are you looking to learn\?/;

type SetupOpts = Exclude<Parameters<typeof setup>[0], void>;

const ASK_CONVERSATION_ID = testConversationId("ask");

const setupMetabotAsk = (options?: Omit<SetupOpts, "ui">) =>
  setup({ ...options, ui: <MetabotAsk /> });

const askConversation = (field: string, value: unknown) =>
  assocIn(
    createTestMetabotState(),
    ["conversations", ASK_CONVERSATION_ID, field],
    value,
  );

describe("MetabotAsk", () => {
  it("shows the greeting and closes the global Metabot sidebar", async () => {
    const { store } = setupMetabotAsk({
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

  it("sends messages with the nlq profile", async () => {
    setupMetabotAsk();
    const agentSpy = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");

    const body: unknown = await lastReqBody(agentSpy);
    expect(body).toMatchObject({
      message: "Who is your favorite?",
      profile_id: "nlq",
    });
  });

  it("shows a failed response inline in the conversation", async () => {
    setupMetabotAsk();
    mockAgentEndpoint({ events: erroredResponse });

    await enterChatMessage("Tell me about my data");

    await waitFor(async () => {
      expect(await lastChatMessage()).toHaveTextContent(/Something went wrong/);
    });
    expect(screen.getByTestId("metabot-chat")).toBeInTheDocument();
  });

  it("sends a suggested prompt when it is clicked", async () => {
    setupMetabotAsk({
      promptSuggestions: [{ prompt: "Show me all orders" }],
    });
    const agentSpy = mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await userEvent.click(await screen.findByText("Show me all orders"));

    const body: unknown = await lastReqBody(agentSpy);
    expect(body).toMatchObject({ message: "Show me all orders" });
    expect(agentSpy).toHaveBeenCalledTimes(1);
  });

  it("renders a streamed chart inline without leaving the conversation", async () => {
    const TABLE_ID = 2;
    const conversationRoute = `/metabot/conversation/${ASK_CONVERSATION_ID}`;
    setupCardDataset();
    setupDatabaseEndpoints(createMockDatabase({ id: 1 }));
    setupTableEndpoints(createMockTable({ id: TABLE_ID }));
    const { router } = setupMetabotAsk({
      withRouter: true,
      initialRoute: conversationRoute,
    });
    mockAgentEndpoint({
      events: [createMockMetabotGeneratedCardPart({ tableId: TABLE_ID }).part],
    });

    await enterChatMessage("Show me all orders");

    expect(
      await screen.findByTestId("metabot-inline-chart"),
    ).toBeInTheDocument();
    expect(router?.location.pathname).toBe(conversationRoute);
  });

  it("opens the AI provider setup from the greeting when not configured", async () => {
    setupLlmProviderTypesEndpoint();
    setupLlmProvidersEndpoint();
    setupMetabotAsk({
      currentUser: createMockUser({ is_superuser: true }),
      isConfigured: false,
    });

    expect(
      screen.queryByTestId("ai-provider-configuration-modal"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "connect to a model" }),
    );

    expect(
      await screen.findByTestId("ai-provider-configuration-modal"),
    ).toBeInTheDocument();
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
      await screen.findByText("To use AI explorations, please", {
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
    setupMetabotAsk({
      metabotInitialState: askConversation("messages", [
        createMockMetabotTextMessage("user", "Earlier question"),
      ]),
    });

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
    setupMetabotAsk({
      metabotInitialState: askConversation("profileOverride", "sql"),
    });

    expect(await screen.findByText(greetingTitle)).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-conversation-history"),
    ).not.toBeInTheDocument();
  });

  it("navigates to the conversation route after the first message", async () => {
    const { router, store } = setupMetabotAsk({
      withRouter: true,
      initialRoute: "/question/ask",
    });
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");

    await waitFor(() => {
      expect(router?.location.pathname).toBe(
        `/metabot/conversation/${conversationIdForAgent(store, "ask")}`,
      );
    });
  });

  it("navigates to the selected conversation from history", async () => {
    const { router } = setupMetabotAsk({
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
      expect(router?.location.pathname).toBe(
        "/metabot/conversation/past-conversation-id",
      );
    });
  });
});
