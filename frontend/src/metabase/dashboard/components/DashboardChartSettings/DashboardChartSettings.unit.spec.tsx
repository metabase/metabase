import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { getNoResultsMessage } from "metabase/visualizations/lib/no-results";
import { registerVisualizations } from "metabase/visualizations/register";
import { extendCardWithDashcardSettings } from "metabase/viz-core";
import type { Series, VisualizationSettings } from "metabase-types/api";
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
      ).getByRole("radio", { name: "Dashed" }),
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

describe("DashboardChartSettings no-results message", () => {
  const MESSAGE_LABEL = "Message when there are no results";

  const getCard = (display: "scalar" | "line" = "scalar") =>
    createMockCard({
      display,
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "card.no_results_message": "Card message",
      },
    });
  const card = getCard();

  type NoResultsMessageSetupOpts = {
    display?: "scalar" | "line";
    dashcardSettings?: VisualizationSettings;
  };

  const setupNoResultsMessage = ({
    display,
    dashcardSettings = {},
  }: NoResultsMessageSetupOpts = {}) => {
    const onChange = jest.fn<void, [VisualizationSettings]>();
    const dashcardCard = getCard(display);
    setup({
      series: [
        createMockSingleSeries(
          extendCardWithDashcardSettings(dashcardCard, dashcardSettings),
          {
            data: createMockDatasetData({
              cols: [
                createMockColumn({
                  name: "CREATED_AT",
                  base_type: "type/DateTime",
                  effective_type: "type/DateTime",
                  unit: "month",
                }),
                createMockColumn({
                  name: "count",
                  base_type: "type/BigInteger",
                  effective_type: "type/BigInteger",
                  source: "aggregation",
                }),
              ],
              rows: [],
            }),
          },
        ),
      ],
      dashcard: createMockDashboardCard({
        card: dashcardCard,
        visualization_settings: dashcardSettings,
      }),
      settings: undefined,
      onChange,
    });
    return { onChange };
  };

  it.each(["scalar", "line"] as const)(
    "should place the message directly under the hide toggle on a %s card",
    (display) => {
      setupNoResultsMessage({ display });

      const widgetIds = screen
        .getAllByTestId(/^chart-settings-widget-/)
        .map((widget) => widget.dataset.testid);
      const hideEmptyIndex = widgetIds.indexOf(
        "chart-settings-widget-card.hide_empty",
      );

      expect(hideEmptyIndex).toBeGreaterThanOrEqual(0);
      expect(widgetIds[hideEmptyIndex + 1]).toBe(
        "chart-settings-widget-card.no_results_message",
      );
    },
  );

  it("should hide the message while the card is hidden when there are no results", async () => {
    setupNoResultsMessage();

    expect(screen.getByLabelText(MESSAGE_LABEL)).toBeInTheDocument();

    await userEvent.click(
      screen.getByLabelText("Hide this card if there are no results"),
    );

    expect(screen.queryByLabelText(MESSAGE_LABEL)).not.toBeInTheDocument();
  });

  it.each([
    ["its own message", { "card.no_results_message": "Dashcard message" }],
    ["the question's message", {}],
  ] as const)(
    "should show the default instead of the question's message when the dashcard's field is cleared, starting from %s",
    async (_label, dashcardSettings: VisualizationSettings) => {
      const { onChange } = setupNoResultsMessage({ dashcardSettings });

      const textarea = screen.getByLabelText(MESSAGE_LABEL);
      expect(textarea).not.toHaveValue("");

      await userEvent.clear(textarea);
      await userEvent.tab();
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const [savedSettings] = onChange.mock.lastCall ?? [];
      expect(savedSettings).toBeDefined();
      expect(savedSettings).toHaveProperty(["card.no_results_message"], "");

      const dashcardCard = extendCardWithDashcardSettings(card, savedSettings);
      expect(
        getNoResultsMessage(dashcardCard.visualization_settings),
      ).toBeUndefined();
    },
  );
});
