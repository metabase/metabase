import { registerVisualizations } from "metabase/visualizations/register";
import {
  getSettingsWidgetsForSeries,
  getVisualizationTransformed,
} from "metabase/viz-core";
import type { RowValue, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

const MONTH = createMockColumn({
  name: "month",
  display_name: "Month",
  base_type: "type/Text",
  semantic_type: null,
});
const CATEGORY = createMockColumn({
  name: "category",
  display_name: "Category",
  base_type: "type/Text",
  semantic_type: "type/Category",
});
const REVENUE = createMockColumn({
  name: "revenue",
  display_name: "Revenue",
  base_type: "type/Number",
  semantic_type: null,
});
const ORDERS = createMockColumn({
  name: "orders",
  display_name: "Orders",
  base_type: "type/Number",
  semantic_type: null,
});

const getLabelWidgets = (
  cols: ReturnType<typeof createMockColumn>[],
  rows: RowValue[][],
  settings: VisualizationSettings,
) => {
  const rawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "line", visualization_settings: settings }),
      { data: createMockDatasetData({ cols, rows }) },
    ),
  ];
  // The sidebar is handed the transformed series, as it is in the app.
  const { series } = getVisualizationTransformed(rawSeries);
  const widgets = getSettingsWidgetsForSeries(series, jest.fn());
  const findWidget = (id: string) => widgets.find((widget) => widget.id === id);

  return {
    left: findWidget("graph.y_axis.title_text"),
    right: findWidget("graph.y_axis.right.title_text"),
  };
};

describe("y-axis label settings", () => {
  it("should offer one label field when the chart has one axis", () => {
    const { left, right } = getLabelWidgets(
      [MONTH, CATEGORY, REVENUE],
      [
        ["Jan", "A", 1],
        ["Jan", "B", 1000],
        ["Feb", "A", 2],
        ["Feb", "B", 900],
      ],
      {
        "graph.dimensions": ["month", "category"],
        "graph.metrics": ["revenue"],
      },
    );

    expect(left).toMatchObject({ title: "Label", hidden: false });
    expect(right?.hidden).toBe(true);
  });

  it("should offer a label per axis when the chart splits", () => {
    const { left, right } = getLabelWidgets(
      [MONTH, REVENUE, ORDERS],
      [
        ["Jan", 1, 900],
        ["Feb", 2, 1000],
      ],
      {
        "graph.dimensions": ["month"],
        "graph.metrics": ["revenue", "orders"],
      },
    );

    expect(left).toMatchObject({
      title: "Left axis label",
      hidden: false,
      value: null,
    });
    expect(right).toMatchObject({
      title: "Right axis label",
      group: "Y-axis",
      hidden: false,
    });
  });
});
