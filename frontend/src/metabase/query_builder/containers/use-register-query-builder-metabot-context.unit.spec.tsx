import _ from "underscore";

import registerVisualizations from "metabase/visualizations/register";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type {
  RawSeries,
  Timeline,
  TransformedSeries,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockSingleSeries,
  createMockTimeline,
  createMockTimelineEvent,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createAdHocCard } from "metabase-types/api/mocks/presets";

import { registerQueryBuilderMetabotContextFn } from "./use-register-query-builder-metabot-context";

registerVisualizations();

jest.mock("metabase/visualizations/lib/image-exports", () => ({
  getBase64ChartImage: () => Promise.resolve("test-base64"),
  getChartSelector: () => "#chart",
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
  timelines?: Timeline[];
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
    timelines: [],
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
    const data = createMockData({ question: new Question(createAdHocCard()) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const viewing = getUserIsViewing(result)!;
    expect(_.get(viewing, "id")).toEqual(undefined);
    expect(viewing.type).toEqual("adhoc");
  });

  it("should generate an image for the current question", async () => {
    const card = createMockCard({ display: "line" });
    const data = createMockData({ question: new Question(card) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.image_base_64).toEqual("test-base64");
  });

  it("should produce valid series results", async () => {
    const card = createMockCard({
      name: "Count by name",
      display: "line",
      visualization_settings: createMockVisualizationSettings({
        "graph.dimensions": ["name"],
        "graph.metrics": ["count"],
      }),
    });
    const data = createMockData({ question: new Question(card) });
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
  });

  it("should produce valid timeline event results", async () => {
    const card = createMockCard({
      name: "Count by name",
      display: "line",
      visualization_settings: createMockVisualizationSettings({
        "graph.dimensions": ["name"],
        "graph.metrics": ["count"],
      }),
    });
    const timelineEvents = [
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
    ];
    const timelines = [createMockTimeline({ events: timelineEvents })];
    const data = createMockData({ question: new Question(card), timelines });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.timeline_events).toHaveLength(3);
    expect(chartConfig.timeline_events.map((e) => e.name)).toEqual([
      "First Event",
      "Second Event",
      "Third Event",
    ]);
  });
});
