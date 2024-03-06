import { renderWithProviders, screen } from "__support__/ui";

import { VisualizationRunningState } from "./QueryVisualization";

type SetupOpts = {
  loadingMessage: string;
};

function setup({ loadingMessage }: SetupOpts) {
  renderWithProviders(
    <VisualizationRunningState loadingMessage={loadingMessage} />,
  );
}

describe("VisualizationRunningState", () => {
  it("should render the different loading messages after a while", () => {
    jest.useFakeTimers();

    setup({ loadingMessage: "Doing science..." });
    expect(screen.getByText("Doing science...")).toBeInTheDocument();

    jest.advanceTimersByTime(5000);
    expect(screen.getByText("Waiting for results...")).toBeInTheDocument();
  });

  it("should only render the custom loading message when it was customized", () => {
    setup({ loadingMessage: "Thinking hard..." });
    expect(screen.getByText("Thinking hard...")).toBeInTheDocument();

    jest.advanceTimersByTime(5000);
    expect(screen.getByText("Thinking hard...")).toBeInTheDocument();
  });
});
