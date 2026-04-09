import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { mockStreamedEndpoint } from "metabase/api/ai-streaming/test-utils";
import { useToast } from "metabase/common/hooks/use-toast";
import { MetabotProvider } from "metabase/metabot/context";
import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import { createMockState } from "metabase/redux/store/mocks";

import { AIQuestionAnalysisButton } from "./AIQuestionAnalysisButton";

const mockSendToast = jest.fn();

jest.mock("metabase/common/hooks/use-toast", () => ({
  ...jest.requireActual("metabase/common/hooks/use-toast"),
  useToast: jest.fn(),
}));

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
  jest.mocked(useToast).mockReturnValue([mockSendToast, jest.fn()]);

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

    await waitFor(() => expect(agentSpy).toHaveBeenCalled());
    const lastCall = agentSpy.mock.lastCall;
    const body = JSON.parse(lastCall?.[1]?.body as string);
    expect(body.message).toBe("Analyze this chart");
  });

  it("should show the not-configured toast instead of submitting when AI is not configured", async () => {
    const agentSpy = mockAgentEndpoint();

    setup({ isConfigured: false, isMetabotEnabled: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Explain this chart" }),
    );

    expect(mockSendToast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "metabot-not-configured",
        dark: false,
        icon: null,
        toastColor: "error",
        dismissIconColor: "text-secondary",
        timeout: 0,
        style: {
          padding: "1rem",
          width: "min(24rem, calc(100vw - 2 * var(--mantine-spacing-md)))",
        },
        renderChildren: expect.any(Function),
      }),
    );
    expect(agentSpy).not.toHaveBeenCalled();
  });
});
