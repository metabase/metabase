import { renderWithProviders, screen } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { CardDisplayType } from "metabase-types/api";

import { ChartTypeList, type ChartTypeListProps } from "./ChartTypeList";

registerVisualizations();

const TEST_CHART_TYPE_LIST: CardDisplayType[] = [
  "table",
  "bar",
  "scalar",
  "row",
  "area",
  "combo",
  "pivot",
];

const TEST_LABELS = [
  "Table",
  "Bar",
  "Number",
  "Row",
  "Area",
  "Combo",
  "Pivot Table",
];

const setup = ({
  onClick = jest.fn(),
  selectedVisualization = "table",
  visualizationList = TEST_CHART_TYPE_LIST,
}: Partial<ChartTypeListProps> = {}) => {
  renderWithProviders(
    <ChartTypeList
      visualizationList={visualizationList}
      selectedVisualization={selectedVisualization}
      onClick={onClick}
    />,
  );
};

describe("ChartTypeList", () => {
  it("should display a given list of visualizations", () => {
    setup();

    expect(screen.getAllByTestId("chart-type-option")).toHaveLength(
      TEST_CHART_TYPE_LIST.length,
    );

    TEST_LABELS.forEach(label =>
      expect(screen.getByTestId(`${label}-button`)).toBeInTheDocument(),
    );
  });
});
