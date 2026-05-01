import type { ComponentType } from "react";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { useGetSuggestedMetabotPromptsQuery } from "metabase/api";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
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
};

function setup({
  showIllustrations = true,
  prompt = "",
  suggestedPrompts = [],
}: SetupOptions = {}) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    canUseNlq: true,
  } as any);
  jest.mocked(useMetabotAgent).mockReturnValue({
    setVisible: jest.fn(),
    resetConversation: jest.fn(),
    submitInput: jest.fn(),
    cancelRequest: jest.fn(),
    setPrompt: jest.fn(),
    metabotId: "default",
    isDoingScience: false,
    prompt,
    promptInputRef: { current: null },
  } as any);
  jest.mocked(useGetSuggestedMetabotPromptsQuery).mockReturnValue({
    currentData: { prompts: suggestedPrompts },
  } as any);

  const settings = mockSettings({
    "metabot-show-illustrations": showIllustrations,
  });

  return renderWithProviders(<Route path="/" component={TestSubject} />, {
    withRouter: true,
    storeInitialState: createMockState({ settings }),
  });
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
});
