import { renderWithProviders, screen } from "__support__/ui";

import { VisualizationPreview } from "./NotebookStepPreview";

test("vizualization preview should render an error message when an error occurs (metabase#40724)", () => {
  renderWithProviders(
    <VisualizationPreview
      rawSeries={null}
      result={null}
      error={{ status: 0 }}
    />,
  );
  expect(screen.getByText("Could not fetch preview")).toBeInTheDocument();
});

test("vizualization preview a custom error message when an error occurs (metabase#40724)", () => {
  const message = "This is a custom message";
  renderWithProviders(
    <VisualizationPreview rawSeries={null} result={null} error={{ message }} />,
  );
  expect(screen.getByText(message)).toBeInTheDocument();
});

test("vizualization preview an error message when an error is passed from the results (metabase#40724)", () => {
  const message = "This is a custom message";
  renderWithProviders(
    <VisualizationPreview
      rawSeries={null}
      result={{ error: message }}
      error={null}
    />,
  );
  expect(screen.getByText(message)).toBeInTheDocument();
});
