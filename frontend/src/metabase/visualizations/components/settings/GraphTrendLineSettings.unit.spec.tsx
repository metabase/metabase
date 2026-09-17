import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { QuestionChartSettings } from "metabase/visualizations/components/ChartSettings";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockInsight,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

const CUSTOM_COLOR = "#88BF4D";

// the card name differs from the metric key so a write under the wrong key
// would be caught
const getSeries = (visualizationSettings: VisualizationSettings): Series => [
  createMockSingleSeries(
    {
      name: "Orders over time",
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "graph.show_trendline": true,
        ...visualizationSettings,
      },
    },
    {
      data: createMockDatasetData({
        rows: [
          ["2024-01-01T00:00:00Z", 1],
          ["2024-02-01T00:00:00Z", 2],
        ],
        cols: [
          createMockColumn({
            name: "CREATED_AT",
            display_name: "Created At",
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
            unit: "month",
          }),
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/BigInteger",
            effective_type: "type/BigInteger",
            source: "aggregation",
          }),
        ],
        insights: [createMockInsight({ col: "count" })],
      }),
    },
  ),
];

const getStyleWidget = () =>
  screen.getByTestId("chart-settings-widget-graph.trendline_style");

const getColorWidget = () =>
  screen.getByTestId("chart-settings-widget-graph.trendline_color");

const getDashedOption = () =>
  within(getStyleWidget()).getByRole("button", { name: /line_style_dashed/i });

describe("graph trend line settings for a single series", () => {
  describe("in the query builder", () => {
    const setup = (visualizationSettings: VisualizationSettings = {}) => {
      const onChange = jest.fn();
      renderWithProviders(
        <QuestionChartSettings
          series={getSeries(visualizationSettings)}
          onChange={onChange}
          initial={{ section: "Display" }}
        />,
      );
      return { onChange };
    };

    it("should write the style into the series settings under the metric key", async () => {
      const { onChange } = setup();

      await userEvent.click(
        within(getStyleWidget()).getByRole("img", {
          name: /line_style_dashed/i,
        }),
      );

      const [settings] = onChange.mock.lastCall ?? [];
      expect(settings).toMatchObject({
        series_settings: { count: { "trendline.style": "dashed" } },
      });
      expect(Object.keys(settings.series_settings)).toEqual(["count"]);
      expect(settings).not.toHaveProperty("graph.trendline_style");
    });

    it("should write the color into the series settings and keep its other settings", async () => {
      const { onChange } = setup({
        series_settings: { count: { "trendline.style": "dashed" } },
      });

      await userEvent.click(within(getColorWidget()).getByLabelText(/^#/));
      await userEvent.click(
        within(screen.getByTestId("color-selector-popover")).getByLabelText(
          CUSTOM_COLOR,
        ),
      );

      const [settings] = onChange.mock.lastCall ?? [];
      expect(settings).toMatchObject({
        series_settings: {
          count: {
            "trendline.style": "dashed",
            "trendline.color": CUSTOM_COLOR,
          },
        },
      });
      expect(settings).not.toHaveProperty("graph.trendline_color");
    });

    it("should show the values stored for the series", () => {
      setup({
        series_settings: {
          count: {
            "trendline.color": CUSTOM_COLOR,
            "trendline.style": "dashed",
          },
        },
      });

      expect(
        within(getColorWidget()).getByLabelText(CUSTOM_COLOR),
      ).toBeInTheDocument();
      expect(getDashedOption()).toHaveAttribute("data-variant", "filled");
    });
  });
});
