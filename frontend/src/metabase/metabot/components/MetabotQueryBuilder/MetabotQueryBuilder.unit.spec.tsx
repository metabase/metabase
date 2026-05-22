import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { Route } from "react-router";

import { setupBookmarksEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import type { MetabotChatMessage } from "metabase/metabot/state";
import { createMockState } from "metabase/redux/store/mocks";

import { MetabotQueryBuilder } from "./MetabotQueryBuilder";

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useGetSuggestedMetabotPromptsQuery: jest.fn(),
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useUserMetabotPermissions: jest.fn(),
}));

// Hide the QueryBuilder prop type the wrapper inherits — it's irrelevant
// since the canUseNlq path renders the inner component with no props.
const TestSubject = MetabotQueryBuilder as ComponentType;

type SetupOptions = {
  showIllustrations?: boolean;
  prompt?: string;
  suggestedPrompts?: { prompt: string }[];
  messages?: MetabotChatMessage[];
  submitInput?: jest.Mock;
};

function setup({
  showIllustrations = true,
  prompt = "",
  suggestedPrompts = [],
  messages = [],
  submitInput = jest.fn().mockResolvedValue({ payload: { success: true } }),
}: SetupOptions = {}) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    hasNlqAccess: true,
    canUseNlq: true,
  } as any);

  setupBookmarksEndpoints([]);

  const metabot = {
    setVisible: jest.fn(),
    resetConversation: jest.fn(),
    submitInput,
    retryMessage: jest.fn(),
    cancelRequest: jest.fn(),
    setPrompt: jest.fn(),
    metabotId: "default",
    isDoingScience: false,
    isLongConversation: false,
    activeToolCalls: [],
    debugMode: false,
    messages,
    prompt,
    promptInputRef: { current: null },
  } as any;
  jest.mocked(useMetabotAgent).mockReturnValue(metabot);
  jest.mocked(useGetSuggestedMetabotPromptsQuery).mockReturnValue({
    currentData: { prompts: suggestedPrompts },
  } as any);

  const settings = mockSettings({
    "metabot-show-illustrations": showIllustrations,
  });

  const view = renderWithProviders(<Route path="/" component={TestSubject} />, {
    withRouter: true,
    storeInitialState: createMockState({ settings }),
  });

  return { ...view, metabot };
}

describe("MetabotQueryBuilder", () => {
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

  it("disables the send button when the prompt is empty", () => {
    setup({ prompt: "" });
    expect(screen.getByTestId("metabot-send-message")).toBeDisabled();
  });

  it("enables the send button when the prompt is non-empty", () => {
    setup({ prompt: "anything" });
    expect(screen.getByTestId("metabot-send-message")).toBeEnabled();
  });

  it("renders the conversation inline when messages exist", () => {
    setup({
      messages: [
        { id: "1", role: "user", type: "text", message: "Show me orders" },
        {
          id: "2",
          role: "agent",
          type: "text",
          message: "Here are the orders.",
        },
      ],
      suggestedPrompts: [{ prompt: "A suggested prompt" }],
    });

    expect(
      screen.getByTestId("metabot-query-builder-chat-messages"),
    ).toBeInTheDocument();
    expect(screen.getByText("Show me orders")).toBeInTheDocument();
    expect(screen.getByText("Here are the orders.")).toBeInTheDocument();
    expect(screen.queryByText("A suggested prompt")).not.toBeInTheDocument();
  });

  it("submits prompts without opening the sidebar or navigating to generated questions", async () => {
    const submitInput = jest.fn().mockResolvedValue({
      payload: { success: true },
    });
    setup({ prompt: "Show me orders", submitInput });

    await userEvent.click(screen.getByTestId("metabot-send-message"));

    expect(submitInput).toHaveBeenCalledWith("Show me orders", {
      profile: "nlq",
      preventOpenSidebar: true,
      suppressNavigateTo: true,
    });
  });
});
