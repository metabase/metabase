import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_SELECTORS } from "metabase/plugins";

import { VisualizationRunningState } from "./QueryVisualization";

type SetupOpts = {
  customMessage?: (isSlow: boolean) => string;
};

function setup({ customMessage }: SetupOpts = {}) {
  if (customMessage) {
    jest
      .spyOn(PLUGIN_SELECTORS, "getLoadingMessageFactory")
      .mockImplementation(() => customMessage);
  }

  renderWithProviders(<VisualizationRunningState />);
}

describe("VisualizationRunningState", () => {
  it("should render the different loading messages after a while", async () => {
    jest.useFakeTimers();

    setup();
    expect(await screen.findByText("Doing science...")).toBeInTheDocument();

    jest.advanceTimersByTime(5000);
    expect(
      await screen.findByText("Waiting for results..."),
    ).toBeInTheDocument();
  });

  it("should only render the custom loading message when it was customized", async () => {
    const customMessage = (isSlow: boolean) =>
      isSlow ? `Custom message (slow)...` : `Custom message...`;

    setup({ customMessage });
    expect(await screen.findByText("Custom message...")).toBeInTheDocument();

    jest.advanceTimersByTime(5000);
    expect(
      await screen.findByText("Custom message (slow)..."),
    ).toBeInTheDocument();
  });
});
