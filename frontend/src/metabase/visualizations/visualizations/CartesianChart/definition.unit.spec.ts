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
  createMockFailedReferencedEntitiesResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { getCartesianChartDefinition } from "./definition";

const GOAL_LINE_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["month"],
  "graph.metrics": ["count"],
  "graph.show_goal": true,
};

const REFERENCED_GOAL = { type: "card", id: 9, column: "goal" } as const;

const REFERENCED_GOAL_SETTINGS: VisualizationSettings = {
  ...GOAL_LINE_SETTINGS,
  "graph.goal_value": REFERENCED_GOAL,
};

describe("definition", () => {
  describe("checkRenderable", () => {
    const { checkRenderable } = getCartesianChartDefinition({});

    describe.each(DYNAMIC_GOAL_CARTESIAN_DISPLAYS)(
      "goal line of a %s chart",
      (display) => {
        it("renders when the referenced query failed", () => {
          const series = createSeries(display, {
            referenced_entities: createMockFailedReferencedEntitiesResults(),
          });

          expect(() =>
            checkRenderable(series, REFERENCED_GOAL_SETTINGS),
          ).not.toThrow();
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
