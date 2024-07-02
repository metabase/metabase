import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";

import { getCartesianChartDefinition } from "./chart-definition";

describe("chart-definition", () => {
  describe("onDisplayUpdate", () => {
    const onDisplayUpdate = getCartesianChartDefinition({}).onDisplayUpdate!;

    it("should reset individual series display", () => {
      const settings = {
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
      const settings = {
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
      const settings = {
        "graph.y_axis.min": 50,
      };
      expect(onDisplayUpdate(settings)).toStrictEqual({
        "graph.y_axis.min": 50,
      });
    });
  });
});
