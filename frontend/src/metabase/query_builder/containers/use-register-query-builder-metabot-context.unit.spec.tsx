import _ from "underscore";

import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type {
  RawSeries,
  TimelineEvent,
  TransformedSeries,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockSettings,
  createMockSingleSeries,
  createMockTimelineEvent,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createAdHocCard } from "metabase-types/api/mocks/presets";

import {
  registerQueryBuilderMetabotContextFn,
  useRegisterQueryBuilderMetabotContext,
} from "./use-register-query-builder-metabot-context";

registerVisualizations();

const MOCK_PNG = "data:image/png;base64,test-base64";
const MOCK_SVG = "data:image/svg+xml;base64,test-base64";

jest.mock("metabase/visualizations/lib/image-exports", () => ({
  getChartSelector: () => "#chart",
  getChartImagePngDataUri: () => MOCK_PNG,
  getChartSvgSelector: () => "#chart svg",
  getVisualizationSvgDataUri: () => MOCK_SVG,
}));

const getUserIsViewing = (
  result: Awaited<ReturnType<typeof registerQueryBuilderMetabotContextFn>>,
) => {
  return result?.user_is_viewing?.[0];
};

const getChartConfig = (
  result: Awaited<ReturnType<typeof registerQueryBuilderMetabotContextFn>>,
) => {
  return getUserIsViewing(result)?.chart_configs?.[0];
};

function createMockData(opts: {
  question: Question | undefined;
  series?: RawSeries | TransformedSeries;
  visualizationSettings?: ComputedVisualizationSettings;
  timelineEvents?: TimelineEvent[];
  isMetabotEnabled?: boolean;
}) {
  const question = opts.question;
  const card = question?.card();

  createMockVisualizationSettings();
  return {
    series: [
      createMockSingleSeries(card ?? {}, {
        data: {
          cols: [
            createMockColumn({
              name: "name",
              display_name: "Name",
              base_type: "type/Text",
            }),
            createMockColumn({
              name: "count",
              display_name: "Count",
              base_type: "type/Integer",
              source: "aggregation",
            }),
          ],
          rows: [
            ["a", 1],
            ["b", 2],
            ["c", 3],
          ],
        },
      }),
    ],
    visualizationSettings: question?.settings() ?? {},
    timelineEvents: [],
    queryResult: undefined,
    isMetabotEnabled: opts.isMetabotEnabled ?? true,
    ...opts,
  };
}

describe("registerQueryBuilderMetabotContextFn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should register no context if there is no question", async () => {
    const data = createMockData({ question: undefined });
    const result = await registerQueryBuilderMetabotContextFn(data);

    expect(result).toEqual({});
  });

  it("should handle saved questions", async () => {
    const card = createMockCard();
    const data = createMockData({ question: new Question(card) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const viewing = getUserIsViewing(result);
    expect((viewing as any)?.id).toEqual(card.id);
    expect(viewing?.type).toEqual(card.type);
  });

  it("should handle adhoc questions", async () => {
    const question = new Question(createAdHocCard());
    expect(question.isSaved()).toBe(false);

    const data = createMockData({ question });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const viewing = getUserIsViewing(result)!;
    expect(_.get(viewing, "id")).toEqual(undefined);
    expect(viewing.type).toEqual("adhoc");
  });

  it("should register no context for adhoc questions without a data source", async () => {
    const question = new Question(
      createAdHocCard({
        dataset_query: { type: "query", database: null, query: {} },
      }),
    );

    const data = createMockData({ question });
    const result = await registerQueryBuilderMetabotContextFn(data);

    expect(result).toEqual({});
  });

  it("should generate an image for the current question", async () => {
    const card = createMockCard({ display: "line" });
    const data = createMockData({ question: new Question(card) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    let chartConfig = getChartConfig(result);
    expect(chartConfig).not.toBe(undefined);

    chartConfig = chartConfig!;
    expect(chartConfig.image_base_64).toEqual(MOCK_SVG);
  });

  it("should produce valid results for line charts", async () => {
    const card = createMockCard({
      name: "Count by name",
      display: "line",
      visualization_settings: createMockVisualizationSettings({
        "graph.dimensions": ["name"],
        "graph.metrics": ["count"],
      }),
    });
    const data = createMockData({
      question: new Question(card),
      timelineEvents: [
        createMockTimelineEvent({
          name: "Third Event",
          timestamp: "2025-07-13T00:00:00Z",
        }),
        createMockTimelineEvent({
          name: "First Event",
          timestamp: "2025-07-11T00:00:00Z",
        }),
        createMockTimelineEvent({
          name: "Second Event",
          description: "This happens second",
          timestamp: "2025-07-12T00:00:00Z",
        }),
      ],
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.series).toEqual({
      Count: {
        chart_type: "line",
        display_name: "Count",
        stacked: false,
        x: { name: "name", type: "string" },
        x_values: ["a", "b", "c"],
        y: { name: "count", type: "number" },
        y_values: [1, 2, 3],
      },
    });
    expect(chartConfig.timeline_events).toHaveLength(3);
    expect(chartConfig.timeline_events?.map((e) => e.name)).toEqual([
      "First Event",
      "Second Event",
      "Third Event",
    ]);
  });

  it("should re-project a breakout row chart so y_values are the numeric metric (BOT-1598)", async () => {
    // Two text dimensions + a count metric, the same shape as the query in BOT-1598.
    const card = createMockCard({
      name: "Count by category and series",
      display: "row",
      visualization_settings: createMockVisualizationSettings({
        "graph.dimensions": ["cat", "series"],
        "graph.metrics": ["count"],
      }),
    });
    const rawRowSeries: RawSeries = [
      createMockSingleSeries(card, {
        data: {
          cols: [
            createMockColumn({
              name: "cat",
              display_name: "Category",
              base_type: "type/Text",
            }),
            createMockColumn({
              name: "series",
              display_name: "Series",
              base_type: "type/Text",
            }),
            createMockColumn({
              name: "count",
              display_name: "Count",
              base_type: "type/Integer",
              source: "aggregation",
            }),
          ],
          rows: [
            ["A", "X", 1],
            ["B", "X", 2],
            ["A", "Y", 3],
            ["B", "Y", 4],
          ],
        },
      }),
    ];
    const data = createMockData({
      question: new Question(card),
      series: rawRowSeries,
      visualizationSettings: createMockVisualizationSettings({
        "graph.dimensions": ["cat", "series"],
        "graph.metrics": ["count"],
      }),
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const series = getChartConfig(result)!.series!;
    const entries = Object.values(series);
    expect(entries).toHaveLength(2);

    entries.forEach((seriesConfig) => {
      expect(seriesConfig.chart_type).toBe("row");
      expect(seriesConfig.x).toEqual({ name: "cat", type: "string" });
      expect(seriesConfig.y).toEqual({ name: "count", type: "number" });
      expect(seriesConfig.x_values).toEqual(["A", "B"]);
      expect(seriesConfig.y_values).toHaveLength(
        seriesConfig.x_values?.length ?? 0,
      );
      // The metric must reach y_values as numbers, never the text breakout column (BOT-1598).
      expect(
        (seriesConfig.y_values ?? []).every(
          (value) => typeof value === "number",
        ),
      ).toBe(true);
    });

    const allYValues = entries.flatMap(
      (seriesConfig) => seriesConfig.y_values ?? [],
    );
    expect([...allYValues].sort()).toEqual([1, 2, 3, 4]);
  });

  it("should produce valid series results for a single-dimension row chart", async () => {
    const card = createMockCard({
      name: "Count by name",
      display: "row",
      visualization_settings: createMockVisualizationSettings({
        "graph.dimensions": ["name"],
        "graph.metrics": ["count"],
      }),
    });
    const data = createMockData({
      question: new Question(card),
      visualizationSettings: createMockVisualizationSettings({
        "graph.dimensions": ["name"],
        "graph.metrics": ["count"],
      }),
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const series = getChartConfig(result)!.series!;
    const entries = Object.values(series);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      chart_type: "row",
      stacked: false,
      x: { name: "name", type: "string" },
      x_values: ["a", "b", "c"],
      y: { name: "count", type: "number" },
      y_values: [1, 2, 3],
    });
  });

  it("should produce valid series results for pie charts", async () => {
    const card = createMockCard({
      name: "Count by name",
      display: "pie",
      visualization_settings: createMockVisualizationSettings({
        "pie.dimension": "name",
        "pie.metric": "count",
      }),
    });
    const data = createMockData({ question: new Question(card) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.series).toEqual({
      "Count by name": {
        chart_type: "pie",
        display_name: "Count by name",
        stacked: false,
        x: { name: "name", type: "string" },
        x_values: ["a", "b", "c"],
        y: { name: "count", type: "number" },
        y_values: [1, 2, 3],
      },
    });
  });

  it("should produce valid series results for funnel charts", async () => {
    const card = createMockCard({
      name: "Count by name",
      display: "funnel",
      visualization_settings: createMockVisualizationSettings({
        "funnel.dimension": "name",
        "funnel.metric": "count",
      }),
    });
    const data = createMockData({ question: new Question(card) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.image_base_64).toEqual(MOCK_PNG);
    expect(chartConfig.series).toEqual({
      "Count by name": {
        chart_type: "funnel",
        display_name: "Count by name",
        stacked: false,
        x: { name: "name", type: "string" },
        x_values: ["a", "b", "c"],
        y: { name: "count", type: "number" },
        y_values: [1, 2, 3],
      },
    });
  });
});

it("should return empty result when metabot is disabled", async () => {
  const card = createMockCard({
    name: "Count by name",
    display: "table",
    visualization_settings: createMockVisualizationSettings({
      "graph.dimensions": ["name"],
      "graph.metrics": ["count"],
    }),
  });
  const data = createMockData({
    question: new Question(card),
    isMetabotEnabled: false,
  });
  const result = await registerQueryBuilderMetabotContextFn(data);

  expect(getUserIsViewing(result)).toBeUndefined();
});

it("should return populated context when metabot is enabled", async () => {
  const card = createMockCard({
    name: "Count by name",
    display: "table",
    visualization_settings: createMockVisualizationSettings({
      "graph.dimensions": ["name"],
      "graph.metrics": ["count"],
    }),
  });
  const data = createMockData({
    question: new Question(card),
    isMetabotEnabled: true,
  });
  const result = await registerQueryBuilderMetabotContextFn(data);
  const viewing = getUserIsViewing(result);
  expect(viewing).toBeDefined();
});

it("should register without throwing", () => {
  setupUserMetabotPermissionsEndpoint();
  mockSettings(createMockSettings({ "metabot-enabled?": true }));

  expect(() => {
    renderHookWithProviders(() => useRegisterQueryBuilderMetabotContext(), {});
  }).not.toThrow();
});
