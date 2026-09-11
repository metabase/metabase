import { DYNAMIC_GOAL_CARTESIAN_DISPLAYS } from "__support__/dynamic-goals";
import { SERIES_SETTING_KEY } from "metabase/viz-core";
import type {
  DatasetData,
  Series,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { getCartesianChartDefinition } from "./definition";

const GOAL_LINE_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["month"],
  "graph.metrics": ["count"],
  "graph.show_goal": true,
};

const REFERENCED_GOAL = { type: "card", id: 9, column: "goal" } as const;

const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

describe("definition", () => {
  describe("checkRenderable", () => {
    const { checkRenderable } = getCartesianChartDefinition({});

    describe.each(DYNAMIC_GOAL_CARTESIAN_DISPLAYS)(
      "goal line of a %s chart",
      (display) => {
        it("accepts a static goal value", () => {
          expect(() =>
            checkRenderable(createSeries(display), {
              ...GOAL_LINE_SETTINGS,
              "graph.goal_value": 100,
            }),
          ).not.toThrow();
        });

        it("accepts a goal reference that is still resolving", () => {
          expect(() =>
            checkRenderable(createSeries(display), {
              ...GOAL_LINE_SETTINGS,
              "graph.goal_value": REFERENCED_GOAL,
            }),
          ).not.toThrow();
        });

        it("accepts a resolved goal reference", () => {
          const series = createSeries(display, {
            referenced_entities: {
              card: {
                9: {
                  status: "completed",
                  data: {
                    cols: [createMockColumn({ name: "goal" })],
                    rows: [[250]],
                  },
                },
              },
            },
          });

          expect(() =>
            checkRenderable(series, {
              ...GOAL_LINE_SETTINGS,
              "graph.goal_value": REFERENCED_GOAL,
            }),
          ).not.toThrow();
        });

        it("refuses to render when the referenced query failed", () => {
          const series = createSeries(display, {
            referenced_entities: {
              card: { 9: { status: "failed", error: "boom" } },
            },
          });

          expect(() =>
            checkRenderable(series, {
              ...GOAL_LINE_SETTINGS,
              "graph.goal_value": REFERENCED_GOAL,
            }),
          ).toThrow(GOAL_ERROR);
        });

        it("refuses to render when the referenced value is not a number", () => {
          const series = createSeries(display, {
            referenced_entities: {
              card: {
                9: {
                  status: "completed",
                  data: {
                    cols: [createMockColumn({ name: "goal" })],
                    rows: [["x"]],
                  },
                },
              },
            },
          });

          expect(() =>
            checkRenderable(series, {
              ...GOAL_LINE_SETTINGS,
              "graph.goal_value": REFERENCED_GOAL,
            }),
          ).toThrow(GOAL_ERROR);
        });

        it("reads the raw series when given a transformed one", () => {
          const rawSeries = createSeries(display, {
            referenced_entities: {
              card: { 9: { status: "failed", error: "boom" } },
            },
          });
          const transformed = Object.assign(createSeries(display), {
            _raw: rawSeries,
          });

          expect(() =>
            checkRenderable(transformed, {
              ...GOAL_LINE_SETTINGS,
              "graph.goal_value": REFERENCED_GOAL,
            }),
          ).toThrow(GOAL_ERROR);
        });
      },
    );
  });

  describe("onDisplayUpdate", () => {
    const onDisplayUpdate = getCartesianChartDefinition({}).onDisplayUpdate!;

    it("should reset individual series display", () => {
      const settings: VisualizationSettings = {
        "graph.y_axis.min": 50,
        [SERIES_SETTING_KEY]: {
          foo: {
            title: "revenue",
            display: "bar",
          },
          bar: {
            display: "line",
          },
        },
      };

      expect(onDisplayUpdate(settings)).toStrictEqual({
        "graph.y_axis.min": 50,
        [SERIES_SETTING_KEY]: {
          foo: {
            title: "revenue",
          },
        },
      });
    });

    it("should remove series settings when they contain only series displays", () => {
      const settings: VisualizationSettings = {
        "graph.y_axis.min": 50,
        [SERIES_SETTING_KEY]: {
          foo: {
            display: "bar",
          },
          bar: {
            display: "line",
          },
        },
      };
      expect(onDisplayUpdate(settings)).toStrictEqual({
        "graph.y_axis.min": 50,
      });
    });

    it("should return unchanged settings when no series settings", () => {
      const settings: VisualizationSettings = {
        "graph.y_axis.min": 50,
      };
      expect(onDisplayUpdate(settings)).toStrictEqual({
        "graph.y_axis.min": 50,
      });
    });
  });
});

function createSeries(
  display: VisualizationDisplay,
  data: Partial<DatasetData> = {},
): Series {
  return [
    createMockSingleSeries(
      { display },
      {
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "month", base_type: "type/Text" }),
            createMockColumn({ name: "count", base_type: "type/Integer" }),
          ],
          rows: [
            ["Jan", 10],
            ["Feb", 20],
          ],
          ...data,
        }),
      },
    ),
  ];
}
