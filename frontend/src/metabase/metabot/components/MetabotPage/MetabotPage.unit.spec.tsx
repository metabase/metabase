import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupBookmarksEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import { MetabotProvider } from "metabase/metabot/context";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { createMockState } from "metabase/redux/store/mocks";

import { MetabotPage } from "./MetabotPage";

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useGetSuggestedMetabotPromptsQuery: jest.fn(),
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

type SetupOptions = {
  canUseNlq?: boolean;
  showIllustrations?: boolean;
  suggestedPrompts?: { prompt: string }[];
  initialRoute?: string;
  seedAgentId?: string;
};

function setup({
  canUseNlq = true,
  showIllustrations = true,
  suggestedPrompts = [],
  initialRoute = "/",
  seedAgentId,
}: SetupOptions = {}) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    hasNlqAccess: canUseNlq,
    canUseNlq,
    isLoading: false,
  } as any);

  jest.mocked(useGetSuggestedMetabotPromptsQuery).mockReturnValue({
    currentData: { prompts: suggestedPrompts },
  } as any);

  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([]);

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
      messages: [],
      visible: false,
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

  it("shows the TODO placeholder when no Redux conversation exists for the URL id", () => {
    setup({ initialRoute: "/chat/missing-id" });
    expect(
      screen.getByText("TODO: load historical conversation"),
    ).toBeInTheDocument();
  });

  it("renders the chat surface when a conversation exists for the URL id", () => {
    setup({
      initialRoute: "/chat/live-id",
      seedAgentId: "chat_live-id",
    });
    expect(screen.getByTestId("metabot-send-message")).toBeInTheDocument();
  });
});
