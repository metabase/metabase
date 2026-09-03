import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { VisualizationResult } from "./VisualizationResult";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
const question = new Question(createMockCard(), metadata);
const emptyResult = createMockDataset();

describe("VisualizationResult", () => {
  it("should render the no-results action", () => {
    renderWithProviders(
      <VisualizationResult
        question={question}
        result={emptyResult}
        noResultsAction={<p>Alert prompt</p>}
      />,
    );

    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.getByText("Alert prompt")).toBeInTheDocument();
  });

  it("should not render an alert link without a no-results action", () => {
    renderWithProviders(
      <VisualizationResult question={question} result={emptyResult} />,
    );

    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.queryByText(/get an alert/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to previous results" }),
    ).toBeInTheDocument();
  });
});
