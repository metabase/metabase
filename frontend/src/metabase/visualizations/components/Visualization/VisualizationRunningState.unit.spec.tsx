import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { act, renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import type { LoadingMessage } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { VisualizationRunningState } from "./VisualizationRunningState";

type SetupOpts = {
  customMessage?: (isSlow?: boolean) => string;
  loadingMessage?: LoadingMessage;
};

function setup({ customMessage, loadingMessage }: SetupOpts = {}) {
  if (customMessage) {
    jest
      .spyOn(PLUGIN_SELECTORS, "getLoadingMessageFactory")
      .mockImplementation(() => customMessage);
  }

  const settings = loadingMessage
    ? mockSettings({
        "loading-message": loadingMessage,
        "token-features": createMockTokenFeatures({ whitelabel: true }),
      })
    : undefined;
  if (loadingMessage) {
    setupEnterpriseOnlyPlugin("whitelabel");
  }

  renderWithProviders(<VisualizationRunningState />, {
    storeInitialState: { settings },
  });
}

describe("VisualizationRunningState", () => {
  it("should render the different loading messages after a while", async () => {
    jest.useFakeTimers();

    setup();
    expect(await screen.findByText("Doing science...")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(
      await screen.findByText("Waiting for results..."),
    ).toBeInTheDocument();
  });

  it("should only render the custom loading message when it was customized", async () => {
    const customMessage = (isSlow?: boolean) =>
      isSlow ? `Custom message (slow)...` : `Custom message...`;

    setup({ customMessage });
    expect(await screen.findByText("Custom message...")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(
      await screen.findByText("Custom message (slow)..."),
    ).toBeInTheDocument();
  });

  it.each([
    { value: "loading-results", message: "Loading results..." },
    { value: "running-query", message: "Running query..." },
    { value: "doing-science", message: "Doing science..." },
  ] as const)(
    "should render the $value whitelabel loading message",
    async ({ value, message }) => {
      setup({ loadingMessage: value });
      expect(await screen.findByText(message)).toBeInTheDocument();
    },
  );
});
