import _ from "underscore";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderHook } from "__support__/ui";
import { PLUGIN_METABOT } from "metabase/plugins";
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
  createMockTokenFeatures,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createAdHocCard } from "metabase-types/api/mocks/presets";

import {
  registerQueryBuilderMetabotContextFn,
  useRegisterQueryBuilderMetabotContext,
} from "./use-register-query-builder-metabot-context";

const MOCK_PNG = "data:image/png;base64,test-base64";
const MOCK_SVG = "data:image/svg+xml;base64,test-base64";

jest.mock("metabase/visualizations/lib/image-exports", () => ({
  getChartSelector: () => "#chart",
  getChartImagePngDataUri: () => MOCK_PNG,
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
    ...opts,
  };
}

describe("registerQueryBuilderMetabotContextFn", () => {
  beforeAll(() => {
    mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          ai_entity_analysis: true,
          metabot_v3: true,
        }),
      }),
    );
    setupEnterpriseOnlyPlugin("metabot");
    setupEnterpriseOnlyPlugin("ai-entity-analysis");
  });

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
      "Count by name": {
        chart_type: "line",
        display_name: "Count by name",
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

  it("should produce valid series results for pie charts with string dimension", async () => {
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

  it("should produce valid series results for pie charts with array dimension", async () => {
    const card = createMockCard({
      name: "Count by name",
      display: "pie",
      visualization_settings: createMockVisualizationSettings({
        "pie.dimension": ["name"], // Array dimension (common in actual usage)
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

  it("should set display_type to histogram when graph.x_axis.scale is histogram", async () => {
    const card = createMockCard({
      name: "Value distribution",
      display: "bar",
      visualization_settings: createMockVisualizationSettings({
        "graph.dimensions": ["value"],
        "graph.metrics": ["count"],
        "graph.x_axis.scale": "histogram",
      }),
    });
    const data = createMockData({
      question: new Question(card),
      series: [
        createMockSingleSeries(card, {
          data: {
            cols: [
              createMockColumn({
                name: "value",
                display_name: "Value",
                base_type: "type/Integer",
              }),
              createMockColumn({
                name: "count",
                display_name: "Count",
                base_type: "type/Integer",
                source: "aggregation",
              }),
            ],
            rows: [
              [10, 5],
              [20, 8],
              [30, 3],
            ],
          },
        }),
      ],
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.display_type).toEqual("histogram");
  });

  it("should produce valid series for scalar charts", async () => {
    const card = createMockCard({
      name: "Total Revenue",
      display: "scalar",
      visualization_settings: createMockVisualizationSettings({
        "scalar.field": "total",
      }),
    });
    const data = createMockData({
      question: new Question(card),
      series: [
        createMockSingleSeries(card, {
          data: {
            cols: [
              createMockColumn({
                name: "total",
                display_name: "Total",
                base_type: "type/Integer",
              }),
            ],
            rows: [[42000]],
          },
        }),
      ],
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.series).toEqual({
      "Total Revenue": {
        x: { name: "total", type: "number" },
        x_values: [42000],
        display_name: "Total Revenue",
        chart_type: "scalar",
      },
    });
  });

  it("should produce valid series for smartscalar charts with only comparison and current values", async () => {
    const card = createMockCard({
      name: "Monthly Revenue",
      display: "smartscalar",
      visualization_settings: createMockVisualizationSettings({
        "scalar.field": "revenue",
      }),
    });
    const data = createMockData({
      question: new Question(card),
      series: [
        createMockSingleSeries(card, {
          data: {
            cols: [
              createMockColumn({
                name: "month",
                display_name: "Month",
                base_type: "type/Date",
              }),
              createMockColumn({
                name: "revenue",
                display_name: "Revenue",
                base_type: "type/Integer",
              }),
            ],
            rows: [
              ["2024-01", 10000],
              ["2024-02", 12000],
              ["2024-03", 15000],
            ],
          },
        }),
      ],
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    // SmartScalar sends only the comparison value and current value (not all data)
    expect(chartConfig.series).toEqual({
      "Monthly Revenue": {
        x: { name: "month", type: "date" },
        y: { name: "revenue", type: "number" },
        x_values: ["2024-02", "2024-03"], // comparison date, current date
        y_values: [12000, 15000], // comparison value, current value
        display_name: "Monthly Revenue",
        chart_type: "smartscalar",
      },
    });
  });

  it("should handle smartscalar with static number comparison", async () => {
    const card = createMockCard({
      name: "Revenue vs Target",
      display: "smartscalar",
      visualization_settings: createMockVisualizationSettings({
        "scalar.field": "revenue",
        "scalar.comparisons": [
          { id: "1", type: "staticNumber", value: 10000, label: "Target" },
        ],
      }),
    });
    const data = createMockData({
      question: new Question(card),
      series: [
        createMockSingleSeries(card, {
          data: {
            cols: [
              createMockColumn({
                name: "month",
                display_name: "Month",
                base_type: "type/Date",
              }),
              createMockColumn({
                name: "revenue",
                display_name: "Revenue",
                base_type: "type/Integer",
              }),
            ],
            rows: [["2024-03", 15000]],
          },
        }),
      ],
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    // Static comparison has no date, just the values
    expect(chartConfig.series?.["Revenue vs Target"]?.y_values).toEqual([
      10000, 15000,
    ]);
  });

  it("should fall back to first column for scalar charts without scalar.field", async () => {
    const card = createMockCard({
      name: "Total Count",
      display: "scalar",
      visualization_settings: createMockVisualizationSettings({}),
    });
    const data = createMockData({
      question: new Question(card),
      series: [
        createMockSingleSeries(card, {
          data: {
            cols: [
              createMockColumn({
                name: "count",
                display_name: "Count",
                base_type: "type/Integer",
              }),
            ],
            rows: [[500]],
          },
        }),
      ],
    });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.series).toEqual({
      "Total Count": {
        x: { name: "count", type: "number" },
        x_values: [500],
        display_name: "Total Count",
        chart_type: "scalar",
      },
    });
  });
});

it("should return empty result when metabot is disabled", async () => {
  PLUGIN_METABOT.isEnabled = jest.fn(() => false);

  const card = createMockCard({
    name: "Count by name",
    display: "table",
    visualization_settings: createMockVisualizationSettings({
      "graph.dimensions": ["name"],
      "graph.metrics": ["count"],
    }),
  });
  const data = createMockData({ question: new Question(card) });
  const result = await registerQueryBuilderMetabotContextFn(data);

  expect(getUserIsViewing(result)).toBeUndefined();
});

it("should return populated context when metabot is enabled", async () => {
  PLUGIN_METABOT.isEnabled = jest.fn(() => true);

  const card = createMockCard({
    name: "Count by name",
    display: "table",
    visualization_settings: createMockVisualizationSettings({
      "graph.dimensions": ["name"],
      "graph.metrics": ["count"],
    }),
  });
  const data = createMockData({ question: new Question(card) });
  const result = await registerQueryBuilderMetabotContextFn(data);
  const viewing = getUserIsViewing(result);
  expect(viewing).toBeDefined();
});

it("should register without throwing", () => {
  PLUGIN_METABOT.isEnabled = jest.fn(() => true);

  expect(() => {
    renderHook(() => useRegisterQueryBuilderMetabotContext());
  }).not.toThrow();
});
