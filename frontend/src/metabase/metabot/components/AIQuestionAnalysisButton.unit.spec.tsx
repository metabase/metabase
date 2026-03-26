import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { mockStreamedEndpoint } from "metabase/api/ai-streaming/test-utils";
import { MetabotProvider } from "metabase/metabot/context";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

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
}: { isMetabotEnabled?: boolean } = {}) {
  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "metabot-enabled?": isMetabotEnabled,
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

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
    },
  );
}

describe("AIQuestionAnalysisButton", () => {
  it("should render the button when metabot is enabled", () => {
    setup({ isMetabotEnabled: true });
    expect(
      screen.getByRole("button", { name: "Explain this chart" }),
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
      screen.getByRole("button", { name: "Explain this chart" }),
    );

    await waitFor(() => expect(agentSpy).toHaveBeenCalled());
    const lastCall = agentSpy.mock.lastCall;
    const body = JSON.parse(lastCall?.[1]?.body as string);
    expect(body.message).toBe("Analyze this chart");
  });
});
