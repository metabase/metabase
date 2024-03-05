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
  it("should render the default loading message initially", () => {
    setup({ loadingMessage: "Doing Science..." });
    expect(screen.getByText("Doing Science...")).toBeInTheDocument();
  });

  it("should render a custom loading message initially", () => {
    setup({ loadingMessage: "Thinking Hard..." });
    expect(screen.getByText("Thinking Hard...")).toBeInTheDocument();
  });

  it("should render a different loading message after a timeout", () => {
    jest.useFakeTimers();

    setup({ loadingMessage: "Doing Science..." });
    expect(screen.getByText("Doing Science...")).toBeInTheDocument();

    jest.runAllTimers();

    expect(screen.getByText("Talking to the database...")).toBeInTheDocument();
  });
});
