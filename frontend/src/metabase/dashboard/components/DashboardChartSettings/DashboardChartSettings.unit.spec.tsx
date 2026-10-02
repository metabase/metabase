import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockInsight,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DashboardChartSettings } from "./DashboardChartSettings";
import type { DashboardChartSettingsProps } from "./types";

registerVisualizations();

const DEFAULT_PROPS = {
  widgets: [],
  series: [
    {
      card: createMockCard({ visualization_settings: {} }),
      ...createMockDataset({ data: { rows: [], cols: [] } }),
    },
  ],
  settings: {},
};

type SetupOpts = Partial<DashboardChartSettingsProps>;

const setup = (props: SetupOpts) => {
  return renderWithProviders(
    <MockDashboardContext dashboard={createMockDashboard()}>
      <DashboardChartSettings {...DEFAULT_PROPS} {...props} />,
    </MockDashboardContext>,
  );
};

describe("DashboardChartSettings", () => {
  it("reset settings should revert to the original card settings with click behavior", async () => {
    const onChange = jest.fn();

    const originalVizSettings = createMockVisualizationSettings({
      "graph.goal_value": 100,
      "graph.show_goal": true,
      "graph.goal_label": "foo",
    });

    const modifiedSettings = createMockVisualizationSettings({
      "graph.show_goal": false,
      "graph.goal_label": "bar",
      click_behavior: {
        type: "link",
        linkType: "url",
      },
    });

    setup({
      dashcard: createMockDashboardCard({
        card: createMockCard({ visualization_settings: originalVizSettings }),
      }),
      settings: modifiedSettings,
      onChange,
    });

    await userEvent.click(screen.getByText("Reset to defaults"));

    expect(onChange).toHaveBeenCalledWith({
      ...originalVizSettings,
      click_behavior: {
        type: "link",
        linkType: "url",
      },
    });
  });
});

describe("DashboardChartSettings trend line customization", () => {
  // the card name differs from the metric key so a write under the wrong key
  // would be caught
  const trendLineCard = createMockCard({
    name: "Orders over time",
    display: "line",
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
      "graph.show_trendline": true,
    },
  });

  const getTrendLineSeries = (): Series => [
    createMockSingleSeries(trendLineCard, {
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
    }),
  ];

  it("should save the single series trend line style into the dashcard series settings", async () => {
    const onChange = jest.fn();
    setup({
      series: getTrendLineSeries(),
      dashcard: createMockDashboardCard({ card: trendLineCard }),
      settings: trendLineCard.visualization_settings,
      onChange,
    });

    await userEvent.click(screen.getByRole("tab", { name: "Display" }));
    await userEvent.click(
      within(
        screen.getByTestId("chart-settings-widget-graph.trendline_style"),
      ).getByRole("button", { name: /line_style_dashed/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    const [settings] = onChange.mock.lastCall ?? [];
    expect(settings).toMatchObject({
      series_settings: { count: { "trendline.style": "dashed" } },
    });
    expect(Object.keys(settings.series_settings)).toEqual(["count"]);
    expect(settings).not.toHaveProperty("graph.trendline_style");
  });
});
