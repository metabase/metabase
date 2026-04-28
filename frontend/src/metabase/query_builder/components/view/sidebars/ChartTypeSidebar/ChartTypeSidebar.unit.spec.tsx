import { renderWithProviders, screen, within } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { Dataset } from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";

import { ChartTypeSidebar } from "./ChartTypeSidebar";

registerVisualizations();

const createResult = (insights: any[] | undefined): Dataset =>
  createMockDataset({
    data: {
      rows: [[1]],
      cols: [{ name: "count", base_type: "type/Integer" }] as any,
      insights,
    },
  });

const setup = (result: Dataset) => {
  return renderWithProviders(
    <ChartTypeSidebar question={null as any} result={result} />,
  );
};

const getSensibleChartNames = () => {
  const sensibleList = screen.getByTestId("display-options-sensible");
  return within(sensibleList)
    .getAllByRole("option")
    .map((el) => el.getAttribute("aria-label"));
};

describe("ChartTypeSidebar", () => {
  it("should not change the sensible chart list when result changes", () => {
    const resultWithInsights = createResult([
      { col: "count", unit: "month", "last-value": 1 },
    ]);

    const { rerender } = setup(resultWithInsights);
    const initialCharts = getSensibleChartNames();

    // Simulate what happens when pivot is selected — result loses insights
    const resultWithoutInsights = createResult(undefined);

    rerender(
      <ChartTypeSidebar
        question={null as any}
        result={resultWithoutInsights}
      />,
    );

    expect(getSensibleChartNames()).toEqual(initialCharts);
  });
});
