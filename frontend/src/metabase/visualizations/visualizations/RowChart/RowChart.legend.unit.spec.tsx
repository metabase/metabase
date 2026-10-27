import { renderWithProviders, screen, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import { createMockVisualizationProps } from "metabase/visualizations/types/mocks";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type { LegendPosition } from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { RowChart } from "./RowChart";

registerVisualizations();

const setup = (legendPosition: LegendPosition) => {
  const card = createMockCard({
    display: "row",
    visualization_settings: {
      "graph.dimensions": ["category"],
      "graph.metrics": ["count", "total"],
      "legend.position": legendPosition,
    },
  });
  const data = createMockDatasetData({
    cols: [
      createMockCategoryColumn({ name: "category" }),
      createMockNumericColumn({ name: "count", display_name: "Count" }),
      createMockNumericColumn({ name: "total", display_name: "Total" }),
    ],
    rows: [
      ["Gadget", 1, 10],
      ["Widget", 2, 20],
    ],
  });
  const rawSeries = [createMockSingleSeries(card, { data })];
  const props = createMockVisualizationProps({
    card,
    data,
    rawSeries,
    series: rawSeries,
    settings: getComputedSettingsForSeries(rawSeries),
    width: 600,
    height: 300,
  });

  renderWithProviders(<RowChart {...props} />);
};

describe("RowChart legend position", () => {
  it("hides the legend when its position is Off", () => {
    setup("off");

    expect(screen.getByTestId("row-chart-container")).toBeInTheDocument();
    expect(screen.queryByLabelText("Legend")).not.toBeInTheDocument();
  });

  it.each<{
    position: LegendPosition;
    orientation: "horizontal" | "vertical";
    isBeforeChart: boolean;
  }>([
    { position: "auto", orientation: "horizontal", isBeforeChart: false },
    { position: "top", orientation: "horizontal", isBeforeChart: true },
    { position: "bottom", orientation: "horizontal", isBeforeChart: false },
    { position: "left", orientation: "vertical", isBeforeChart: true },
    { position: "right", orientation: "vertical", isBeforeChart: false },
  ])(
    "places the legend at $position",
    ({ position, orientation, isBeforeChart }) => {
      setup(position);

      const chart = screen.getByTestId("row-chart-container");
      const legend = screen.getByTestId(`legend-${orientation}`);
      expect(within(legend).getByText("Count")).toBeInTheDocument();
      expect(within(legend).getByText("Total")).toBeInTheDocument();
      expect(
        Boolean(
          legend.compareDocumentPosition(chart) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(isBeforeChart);
    },
  );
});
