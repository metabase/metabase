import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupBookmarksEndpoints,
  setupDatabasesEndpoints,
  setupMetabotListModelsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
  conversationQuery?: ConversationQueryState;
};

function setup({
  canUseNlq = true,
  showIllustrations = true,
  suggestedPrompts = [],
  initialRoute = "/",
  seedAgentId,
  seedMessages = [],
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
      isProcessing: false,
      messages: seedMessages,
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
});
