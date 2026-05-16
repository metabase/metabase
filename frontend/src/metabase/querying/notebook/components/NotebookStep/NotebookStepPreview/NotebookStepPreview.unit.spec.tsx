import { render, screen } from "__support__/ui-minimal";

import { VisualizationPreview } from "./NotebookStepPreview";

jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: ({ error }: { error?: string | null }) => {
    return error ? <div>{error}</div> : <div data-testid="visualization" />;
  },
}));

describe("VisualizationPreview", () => {
  it("should render an error message when an error occurs (metabase#40724)", () => {
    render(
      <VisualizationPreview
        rawSeries={null}
        result={null}
        error={{ status: 0 }}
      />,
    );
    expect(screen.getByText("Could not fetch preview")).toBeInTheDocument();
  });

  it("should render a custom error message when an error occurs (metabase#40724)", () => {
    const message = "This is a custom message";
    render(
      <VisualizationPreview
        rawSeries={null}
        result={null}
        error={{ message }}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("should render an error message when an error is passed from the results (metabase#40724)", () => {
    const message = "This is a custom message";
    render(
      <VisualizationPreview
        rawSeries={null}
        result={{ error: message }}
        error={null}
      />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
