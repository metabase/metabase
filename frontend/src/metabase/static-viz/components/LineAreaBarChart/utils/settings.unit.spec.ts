import _ from "underscore";
import { ChartSettings, Series } from "../../XYChart/types";
import { adjustSettings } from "./settings";

const settings: ChartSettings = {
  x: {
    type: "ordinal",
  },
  y: {
    type: "linear",
  },
  labels: {
    left: "Count",
    bottom: "Date",
  },
};

const chartSize = {
  width: 540,
  height: 300,
};

const minTickSize = 12;

const getSeries = (length: number): Series[] => [
  {
    name: "series",
    color: "black",
    yAxisPosition: "left",
    type: "line",
    data: _.range(length).map(index => [`X:${index}`, index]),
  },
];

describe("adjustSettings", () => {
  describe("ordinal x-axis", () => {
    it("returns unchanged settings when the number X-ticks is less or equal than 10", () => {
      const xValuesCount = 10;
      const adjustedSettings = adjustSettings(
        settings,
        xValuesCount,
        minTickSize,
        chartSize,
      );

      expect(adjustedSettings).toBe(settings);
    });

    it("rotates X-ticks when the number X-ticks is greater than 10", () => {
      const xValuesCount = 11;
      const adjustedSettings = adjustSettings(
        settings,
        xValuesCount,
        minTickSize,
        chartSize,
      );

      expect(adjustedSettings.x.tick_display).toBe("rotate-45");
    });

    it("hides X-ticks when they can't fit", () => {
      const xValuesCount = 60;
      const minTickSize = chartSize.width / 60 + 1;

      const adjustedSettings = adjustSettings(
        settings,
        xValuesCount,
        minTickSize,
        chartSize,
      );

      expect(adjustedSettings.x.tick_display).toBe("hide");
    });
  });
});
