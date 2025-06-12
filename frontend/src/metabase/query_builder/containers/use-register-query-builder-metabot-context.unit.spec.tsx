import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";
import { registerQueryBuilderMetabotContextFn } from "./use-register-query-builder-metabot-context";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockSingleSeries,
  createMockTimeline,
  createMockTimelineEvent,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createMockEntitiesState } from "__support__/store";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import type {
  RawSeries,
  Timeline,
  TransformedSeries,
} from "metabase-types/api";
import { ComputedVisualizationSettings } from "metabase/visualizations/types";

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
    // TODO: figure out correct way to mock adhoc questions
    const { id: _id, ...card } = createMockCard();
    const data = createMockData({ question: new Question(card) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const viewing = getUserIsViewing(result);
    expect((viewing as any)?.id).toEqual(undefined);
    expect(viewing?.type).toEqual("adhoc");
  });

  it("should generate an image for the current question", async () => {
    const card = createMockCard({ display: "line" });
    const data = createMockData({ question: new Question(card) });
    const result = await registerQueryBuilderMetabotContextFn(data);

    const chartConfig = getChartConfig(result)!;
    expect(chartConfig.image_base_64).toEqual("test-base64");
  });

  it.only("should produce valid series results", async () => {
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

  it.skip("old should produce valid series and timeline event results", async () => {
    const card = createMockCard({
      display: "line",
      visualization_settings: createMockVisualizationSettings({
        "graph.dimensions": ["name"],
        "graph.metrics": ["count"],
      }),
    });
    const queryResult = createMockDataset({
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
    });
    const timelineEvents = [
      createMockTimelineEvent({ name: "RC1" }),
      createMockTimelineEvent({ name: "RC2" }),
      createMockTimelineEvent({ name: "Release" }),
    ];
    const timeline = createMockTimeline({ events: timelineEvents });

    const state = createMockState({
      entities: {
        ...createMockEntitiesState({
          questions: [card],
          timelines: [timeline],
        }),
        timelines_list: {
          '{"include":"events"}': { list: [timeline], metadata: {} },
        },
      },
      qb: createMockQueryBuilderState({
        card,
        queryResults: [queryResult],
      }),
    });

    const result = await registerQueryBuilderMetabotContextFn(state);
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
    // TODO: how to get partial equals? only care about values on the left.
    expect(chartConfig.timeline_events).toEqual(timelineEvents);
  });
});
