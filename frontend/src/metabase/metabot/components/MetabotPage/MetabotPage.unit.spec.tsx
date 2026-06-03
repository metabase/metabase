import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupBookmarksEndpoints,
  setupDatabasesEndpoints,
  setupMetabotListModelsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  useGetMetabotChatConversationQuery,
  useGetSuggestedMetabotPromptsQuery,
} from "metabase/api";
import { MetabotProvider } from "metabase/metabot/context";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { createMockState } from "metabase/redux/store/mocks";

import { MetabotPage } from "./MetabotPage";

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useGetSuggestedMetabotPromptsQuery: jest.fn(),
  useGetMetabotChatConversationQuery: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useUserMetabotPermissions: jest.fn(),
}));

const submitInputThunkSpy = jest.fn();
jest.mock("metabase/metabot/state", () => {
  const actual = jest.requireActual("metabase/metabot/state");
  return {
    ...actual,
    submitInput: (...args: unknown[]) => {
      submitInputThunkSpy(...args);
      return { type: "metabot/submitInput/mock", payload: args };
    },
  };
});

type ConversationQueryState =
  | { data?: undefined; isLoading?: true; isError?: false; error?: undefined }
  | { data: any; isLoading?: false; isError?: false; error?: undefined }
  | { data?: undefined; isLoading?: false; isError: true; error?: unknown };

type SetupOptions = {
  canUseNlq?: boolean;
  showIllustrations?: boolean;
  suggestedPrompts?: { prompt: string }[];
  initialRoute?: string;
  seedAgentId?: string;
  seedMessages?: any[];
  seedQueuedMessages?: { id: string; message: string }[];
  isProcessing?: boolean;
  conversationQuery?: ConversationQueryState;
};

function setup({
  canUseNlq = true,
  showIllustrations = true,
  suggestedPrompts = [],
  initialRoute = "/",
  seedAgentId,
  seedMessages = [],
  seedQueuedMessages = [],
  isProcessing = false,
  conversationQuery = { isLoading: true },
}: SetupOptions = {}) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    hasNlqAccess: canUseNlq,
    canUseNlq,
    isLoading: false,
  } as any);

  jest.mocked(useGetSuggestedMetabotPromptsQuery).mockReturnValue({
    currentData: { prompts: suggestedPrompts },
  } as any);

  jest
    .mocked(useGetMetabotChatConversationQuery)
    .mockReturnValue(conversationQuery as any);

  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);
  setupMetabotListModelsEndpoint();

  const settings = mockSettings({
    "metabot-show-illustrations": showIllustrations,
  });

  const metabotState: any = {
    conversations: {},
    reactions: { suggestedCodeEdits: {}, suggestedTransforms: [] },
    debugMode: false,
  };
  if (seedAgentId) {
    metabotState.conversations[seedAgentId] = {
      conversationId: seedAgentId.replace("chat_", ""),
      prompt: "",
      promptFocusToken: 0,
      isProcessing,
      title: "Seed chat",
      messages: seedMessages,
      queuedMessages: seedQueuedMessages,
      visible: false,
      inBar: false,
      history: [],
      state: {},
      activeToolCalls: [],
      modelOverride: undefined,
      profileOverride: undefined,
      selectedDatabaseId: undefined,
      pendingMessageExternalId: undefined,
      experimental: { developerMessage: "", metabotReqIdOverride: undefined },
    };
  }

  return renderWithProviders(
    <MetabotProvider>
      <Route path="/" component={MetabotPage} />
      <Route path="/chat/:conversationId" component={MetabotPage} />
    </MetabotProvider>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        settings,
        metabot: metabotState,
      }),
    },
  );
}

const getPromptEditor = () => screen.getAllByRole("textbox")[0];

describe("MetabotPage at /", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the Metabot illustration when metabot-show-illustrations is true", () => {
    setup({ showIllustrations: true });
    expect(screen.getByRole("img", { name: "Metabot" })).toBeInTheDocument();
  });

  it("hides the Metabot illustration when metabot-show-illustrations is false", () => {
    setup({ showIllustrations: false });
    expect(
      screen.queryByRole("img", { name: "Metabot" }),
    ).not.toBeInTheDocument();
  });

  it("renders suggested prompts when the API returns them", () => {
    setup({
      suggestedPrompts: [
        { prompt: "Show me top customers" },
        { prompt: "How many orders this month?" },
      ],
    });
    expect(screen.getByText("Show me top customers")).toBeInTheDocument();
    expect(screen.getByText("How many orders this month?")).toBeInTheDocument();
  });

  it("disables the send button while the prompt is empty", () => {
    setup();
    expect(screen.getByTestId("metabot-send-message")).toBeDisabled();
  });

  it("disables the send button when canUseNlq is false", () => {
    setup({ canUseNlq: false });
    expect(screen.getByTestId("metabot-send-message")).toBeDisabled();
  });

  it("navigates to /chat/<id> on submit", async () => {
    const { history } = setup();

    await userEvent.type(getPromptEditor(), "Show me top customers");
    await userEvent.click(screen.getByTestId("metabot-send-message"));

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toMatch(
        /^\/chat\/[0-9a-f-]+$/,
      );
    });
    expect(submitInputThunkSpy).toHaveBeenCalledTimes(1);
    const [arg] = submitInputThunkSpy.mock.calls[0];
    expect(arg.agentId).toMatch(/^chat_[0-9a-f-]+$/);
    expect(arg.message).toBe("Show me top customers");
  });
});

describe("MetabotPage at /chat/:conversationId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders an empty page while the conversation is loading", () => {
    setup({
      initialRoute: "/chat/missing-id",
      conversationQuery: { isLoading: true },
    });
    expect(
      screen.queryByTestId("metabot-send-message"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("metabot-page-title")).not.toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't load this conversation."),
    ).not.toBeInTheDocument();
  });

  it("renders a not-found placeholder when the conversation fetch errors", () => {
    setup({
      initialRoute: "/chat/missing-id",
      conversationQuery: { isError: true },
    });
    expect(
      screen.getByText("We couldn't load this conversation."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-send-message"),
    ).not.toBeInTheDocument();
  });

  it("hydrates Redux and renders the chat surface when the conversation loads", async () => {
    setup({
      initialRoute: "/chat/loaded-id",
      conversationQuery: {
        data: {
          conversation_id: "loaded-id",
          created_at: "2026-05-23T00:00:00Z",
          summary: null,
          title: "Hydrated chat",
          user_id: 1,
          state: {},
          chat_messages: [
            {
              id: "chat-1",
              role: "user",
              type: "text",
              message: "hello",
            },
          ],
          history: [{ role: "user", content: "hello" }],
        },
      },
    });
    expect(await screen.findByTestId("metabot-page-title")).toHaveTextContent(
      "Hydrated chat",
    );
    expect(screen.getByTestId("metabot-send-message")).toBeInTheDocument();
  });

  it("does not hydrate when the fetched data belongs to a different conversation (stale query data)", () => {
    setup({
      initialRoute: "/chat/fresh-id",
      conversationQuery: {
        data: {
          // Stale data from a previously-viewed conversation; must be ignored.
          conversation_id: "stale-id",
          created_at: "2026-05-23T00:00:00Z",
          summary: null,
          title: "Stale chat",
          user_id: 1,
          state: {},
          chat_messages: [],
          history: [],
        },
      },
    });
    expect(screen.queryByText("Stale chat")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metabot-page-title")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-send-message"),
    ).not.toBeInTheDocument();
  });

  it("renders the chat surface and skips the fetch when the conversation is already in Redux", () => {
    setup({
      initialRoute: "/chat/live-id",
      seedAgentId: "chat_live-id",
      conversationQuery: { isLoading: true },
    });
    expect(screen.getByTestId("metabot-send-message")).toBeInTheDocument();
    // skip option means the underlying hook is called but does not fire a request;
    // verify the component asked the hook to skip.
    const lastCall = jest.mocked(useGetMetabotChatConversationQuery).mock
      .calls[0];
    expect(lastCall?.[1]).toEqual({ skip: true });
  });

  it("minimize docks the conversation into the bar and navigates home", async () => {
    const { store } = setup({
      initialRoute: "/chat/live-id",
      seedAgentId: "chat_live-id",
      seedMessages: [{ id: "m1", role: "user", type: "text", message: "hi" }],
      conversationQuery: { isLoading: true },
    });

    await userEvent.click(screen.getByTestId("metabot-minimize-chat"));

    const convo = (store.getState() as any).metabot.conversations[
      "chat_live-id"
    ];
    expect(convo.inBar).toBe(true);
    expect(convo.visible).toBe(true);
    expect(
      (store.getState() as any).routing.locationBeforeTransitions.pathname,
    ).toBe("/");
  });

  it("shows the fork action for agent messages and opens the fork in fullscreen", async () => {
    const { history, store } = setup({
      initialRoute: "/chat/live-id",
      seedAgentId: "chat_live-id",
      seedMessages: [
        { id: "u1", role: "user", type: "text", message: "hi" },
        {
          id: "a1",
          role: "agent",
          type: "text",
          message: "hello",
          externalId: "e1",
        },
      ],
      conversationQuery: { isLoading: true },
    });

    await userEvent.click(screen.getByTestId("metabot-chat-message-fork"));

    const conversations = (store.getState() as any).metabot.conversations;
    const forkAgentId = Object.keys(conversations).find(
      (id) => id !== "chat_live-id",
    );
    expect(forkAgentId).toMatch(/^chat_[0-9a-f-]+$/);
    expect(history?.getCurrentLocation().pathname).toBe(
      `/chat/${forkAgentId!.replace("chat_", "")}`,
    );
    expect(conversations[forkAgentId!].inBar).toBe(false);
    expect(conversations[forkAgentId!].visible).toBe(false);
    expect(conversations[forkAgentId!].messages.map((m: any) => m.id)).toEqual([
      "u1",
      "a1",
    ]);
  });
});

describe("MetabotPage queued messages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const seededConvo = (over: Partial<SetupOptions> = {}): SetupOptions => ({
    initialRoute: "/chat/live-id",
    seedAgentId: "chat_live-id",
    seedMessages: [{ id: "m1", role: "user", type: "text", message: "hi" }],
    conversationQuery: { isLoading: true },
    ...over,
  });

  it("submits every queued message in order once the agent is free", async () => {
    setup(
      seededConvo({
        isProcessing: false,
        seedQueuedMessages: [
          { id: "q1", message: "first" },
          { id: "q2", message: "second" },
          { id: "q3", message: "third" },
        ],
      }),
    );

    // Regression test for the queue stalling after a single message: the whole
    // queue must drain, not just the head.
    await waitFor(() => expect(submitInputThunkSpy).toHaveBeenCalledTimes(3));
    expect(
      submitInputThunkSpy.mock.calls.map((call) => call[0].message),
    ).toEqual(["first", "second", "third"]);
  });

  it("keeps queued messages parked while the agent is still processing", () => {
    setup(
      seededConvo({
        isProcessing: true,
        seedQueuedMessages: [{ id: "q1", message: "later" }],
      }),
    );

    expect(submitInputThunkSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("metabot-queued-message")).toHaveTextContent(
      "later",
    );
  });

  it("renders a compact row with steer, remove and an edit overflow action", async () => {
    setup(
      seededConvo({
        isProcessing: true,
        seedQueuedMessages: [{ id: "q1", message: "queued one" }],
      }),
    );

    const row = screen.getByTestId("metabot-queued-message");
    expect(within(row).getByText("queued one")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: /Steer/ }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Remove queued message" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(row).getByRole("button", {
        name: "More actions for queued message",
      }),
    );
    expect(await screen.findByText("Edit")).toBeInTheDocument();
  });
});

describe("MetabotPage send / stop button", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const processingConvo = (): SetupOptions => ({
    initialRoute: "/chat/live-id",
    seedAgentId: "chat_live-id",
    seedMessages: [{ id: "m1", role: "user", type: "text", message: "hi" }],
    isProcessing: true,
    conversationQuery: { isLoading: true },
  });

  it("shows only the stop button while processing with an empty prompt", () => {
    setup(processingConvo());

    expect(screen.getByTestId("metabot-stop-response")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-send-message"),
    ).not.toBeInTheDocument();
  });

  it("swaps to the send button while processing once the prompt has text", async () => {
    setup(processingConvo());

    await userEvent.type(getPromptEditor(), "follow up question");

    expect(screen.getByTestId("metabot-send-message")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-stop-response"),
    ).not.toBeInTheDocument();
  });
});
