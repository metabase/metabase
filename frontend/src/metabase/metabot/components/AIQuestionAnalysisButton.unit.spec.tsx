import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { mockStreamedEndpoint } from "metabase/api/ai-streaming/test-utils";
import { MetabotProvider } from "metabase/metabot/context";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { lastReqBody } from "metabase/metabot/tests/utils";
import { createMockState } from "metabase/redux/store/mocks";

import { AIQuestionAnalysisButton } from "./AIQuestionAnalysisButton";

const mockAgentEndpoint = () =>
  mockStreamedEndpoint("/api/metabot/agent-streaming", {
    textChunks: [
      `0:"Here is an analysis of the chart."`,
      `d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`,
    ],
  });

function setup({
  isMetabotEnabled = true,
  isConfigured = true,
}: { isMetabotEnabled?: boolean; isConfigured?: boolean } = {}) {
  const settings = mockSettings({
    "llm-metabot-configured?": isConfigured,
    "metabot-enabled?": isMetabotEnabled,
  });

  setupUserMetabotPermissionsEndpoint();
  setupEnterprisePlugins();

  const metabotState = getMetabotInitialState();

  renderWithProviders(
    <MetabotProvider>
      <AIQuestionAnalysisButton />
    </MetabotProvider>,
    {
      storeInitialState: createMockState({
        settings,
        metabot: metabotState,
      } as any),
      withUndos: true,
    },
  );
}

describe("AIQuestionAnalysisButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the button when metabot is enabled", async () => {
    setup({ isMetabotEnabled: true });
    expect(
      await screen.findByRole("button", { name: "Explain this chart" }),
    ).toBeInTheDocument();
  });

  it("should render the button when metabot is enabled but not configured", async () => {
    setup({ isConfigured: false, isMetabotEnabled: true });
    expect(
      await screen.findByRole("button", { name: "Explain this chart" }),
    ).toBeInTheDocument();
  });

  it("should not render the button when metabot is disabled", () => {
    setup({ isMetabotEnabled: false });
    expect(
      screen.queryByRole("button", { name: "Explain this chart" }),
    ).not.toBeInTheDocument();
  });

  it("should submit analyze prompt when clicked", async () => {
    const agentSpy = mockAgentEndpoint();
    setup({ isMetabotEnabled: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Explain this chart" }),
    );

    const body = await lastReqBody(agentSpy);
    expect(body.message).toBe("Analyze this chart");
  });

  it("should show the not-configured toast instead of submitting when AI is not configured", async () => {
    const agentSpy = mockAgentEndpoint();

    setup({ isConfigured: false, isMetabotEnabled: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Explain this chart" }),
    );

    expect(await screen.findByTestId("toast-undo")).toBeInTheDocument();
    expect(await screen.findByText(/connect to a model/)).toBeInTheDocument();
    expect(agentSpy).not.toHaveBeenCalled();
  });
});
