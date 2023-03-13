import _ from "underscore";

import { createMockSeries } from "metabase-types/api/mocks/series";
import {
  createMockSeriesOrderSetting,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks/card";
import { TransformedSeries } from "metabase-types/api";
import { getOrderedSeries } from "./series";

type setupSeriesOpts = { name: string; enabled?: boolean }[];

const setupSeries = (opts: setupSeriesOpts) => ({
  series: createMockSeries(opts),
  settings: createMockVisualizationSettings({
    "graph.dimensions": ["one", "two"],
    "graph.series_order": opts.map(opt => createMockSeriesOrderSetting(opt)),
  }),
});

describe("series utils", () => {
  describe("getOrderedSeries", () => {
    it("should reorder the series", () => {
      const { series, settings } = setupSeries([
        { name: "foo" },
        { name: "bar" },
      ]);

      const sortedSettings = {
        ...settings,
        "graph.series_order":
          settings["graph.series_order"] &&
          _.sortBy(settings["graph.series_order"], "name"),
      };

      const orderedSeries = getOrderedSeries(series, sortedSettings);
      expect(orderedSeries).toHaveLength(2);

      expect(orderedSeries[0].card.name).toBe("bar");
      expect(orderedSeries[1].card.name).toBe("foo");
    });

    it("should filter hidden series", () => {
      const { series, settings } = setupSeries([
        { name: "foo" },
        { name: "bar", enabled: false },
      ]);

      const orderedSeries = getOrderedSeries(series, settings);
      expect(orderedSeries).toHaveLength(1);
    });

    it("should preserve _raw prop if present", () => {
      const { series, settings } = setupSeries([
        { name: "foo" },
        { name: "bar", enabled: false },
      ]);

      const transformedSeries = [...series] as TransformedSeries;
      transformedSeries._raw = createMockSeries([{ name: "foobar" }]);

      const orderedSeries = getOrderedSeries(transformedSeries, settings);
      expect(orderedSeries).toHaveProperty("_raw");
    });

    it("should reverse the order of a series when `isReversed` is `true`", () => {
      const { series, settings } = setupSeries([
        { name: "foo" },
        { name: "bar" },
        { name: "baz" },
      ]);

      const stackedOrderedSeries = getOrderedSeries(series, settings, true);
      expect(stackedOrderedSeries).toHaveLength(3);
      expect(stackedOrderedSeries[0].card.name).toBe("baz");
      expect(stackedOrderedSeries[1].card.name).toBe("bar");
      expect(stackedOrderedSeries[2].card.name).toBe("foo");
    });
  });
});
