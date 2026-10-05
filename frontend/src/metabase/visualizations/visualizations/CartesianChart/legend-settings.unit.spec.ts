import { registerVisualizations } from "metabase/visualizations/register";
import {
  getSettingsWidgetsForSeries,
  getVisualizationTransformed,
} from "metabase/viz-core";
import type { CardDisplayType } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

const getDisplayWidgetIds = (display: CardDisplayType) => {
  const rawSeries = [
    createMockSingleSeries(
      createMockCard({
        display,
        visualization_settings: {
          "graph.dimensions": ["category"],
          "graph.metrics": ["a", "b"],
        },
      }),
      {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "category", base_type: "type/Text" }),
            createMockColumn({ name: "a", base_type: "type/Number" }),
            createMockColumn({ name: "b", base_type: "type/Number" }),
          ],
          rows: [
            ["x", 1, 2],
            ["y", 3, 4],
          ],
        }),
      },
    ),
  ];
  const { series } = getVisualizationTransformed(rawSeries);
  return getSettingsWidgetsForSeries(series, jest.fn(), true)
    .filter((widget) => !widget.hidden && widget.section === "Display")
    .map((widget) => widget.id);
};

describe("legend.is_visible in the dashboard settings sidebar", () => {
  it.each<CardDisplayType>(["bar", "line", "area", "combo", "scatter"])(
    "sits above the series list for %s",
    (display) => {
      const ids = getDisplayWidgetIds(display);

      expect(ids).toContain("series_settings");
      expect(ids.indexOf("legend.is_visible")).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf("legend.is_visible")).toBeLessThan(
        ids.indexOf("series_settings"),
      );
    },
  );
});
