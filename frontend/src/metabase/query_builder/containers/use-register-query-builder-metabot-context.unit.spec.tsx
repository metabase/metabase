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
