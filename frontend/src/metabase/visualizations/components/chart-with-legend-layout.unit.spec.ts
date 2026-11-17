import type { LegendPosition } from "metabase-types/api";

import { LegendHorizontal } from "./LegendHorizontal";
import { LegendVertical } from "./LegendVertical";
import {
  HIDE_HORIZONTAL_LEGEND_THRESHOLD,
  getChartLayout,
} from "./chart-with-legend-layout";

describe("getChartLayout", () => {
  const defaultInput: Parameters<typeof getChartLayout>[0] = {
    position: "auto",
    width: 800,
    height: 400,
    gridSize: undefined,
    aspectRatio: 1,
    legendTitles: ["Series 1", "Series 2"],
  };

  it("should lay out a wide chart horizontally with a fixed chart size", () => {
    const layout = getChartLayout(defaultInput);

    expect(layout).toMatchObject({
      type: "horizontal",
      isLegendBeforeChart: true,
      LegendComponent: LegendVertical,
      chartWidth: 386,
      chartHeight: 386,
      flexChart: false,
      hasDimensions: true,
    });
    expect(layout.processedLegendTitles).toEqual(["Series 1", "Series 2"]);
  });

  it("should hide secondary title info and flex the chart when the area is narrow", () => {
    const layout = getChartLayout({
      ...defaultInput,
      width: 250,
      height: 200,
      legendTitles: [["Series 1", "50%"], "Series 2"],
    });

    expect(layout).toMatchObject({
      type: "horizontal",
      flexChart: true,
      chartWidth: undefined,
      chartHeight: 186,
    });
    expect(layout.processedLegendTitles).toEqual([["Series 1"], "Series 2"]);
  });

  it("should lay out vertically with joined titles when the grid is tall", () => {
    const layout = getChartLayout({
      ...defaultInput,
      height: 600,
      gridSize: { width: 3, height: 8 },
      aspectRatio: 2,
      legendTitles: [["Series 1", "50%"], "Series 2"],
    });

    expect(layout).toMatchObject({
      type: "vertical",
      isLegendBeforeChart: false,
      LegendComponent: LegendHorizontal,
      isLegendSingleRow: false,
      chartWidth: 772,
      chartHeight: 386,
      flexChart: false,
    });
    expect(layout.processedLegendTitles).toEqual(["Series 1 50%", "Series 2"]);
  });

  it("should use the small layout when the grid has too few columns", () => {
    const layout = getChartLayout({
      ...defaultInput,
      gridSize: { width: 2, height: 8 },
    });

    expect(layout).toMatchObject({
      type: "small",
      LegendComponent: undefined,
      chartWidth: undefined,
      chartHeight: undefined,
      flexChart: false,
    });
  });

  it("should use the small layout when a horizontal chart is below the legend width threshold", () => {
    const layout = getChartLayout({ ...defaultInput, width: 200, height: 100 });

    expect(layout.type).toBe("small");
    expect(layout.LegendComponent).toBeUndefined();
  });

  it("should report missing dimensions when the chart is not measured yet", () => {
    const layout = getChartLayout({ ...defaultInput, width: 0, height: 0 });

    expect(layout).toMatchObject({ type: "small", hasDimensions: false });
  });

  it.each<{ position: LegendPosition; isLegendBeforeChart: boolean }>([
    { position: "left", isLegendBeforeChart: true },
    { position: "right", isLegendBeforeChart: false },
  ])(
    "should place a $position legend beside the chart even when the grid is tall",
    ({ position, isLegendBeforeChart }) => {
      const layout = getChartLayout({
        ...defaultInput,
        position,
        height: 600,
        gridSize: { width: 3, height: 8 },
        legendTitles: [["Series 1", "50%"], "Series 2"],
      });

      expect(layout).toMatchObject({
        type: "horizontal",
        isLegendBeforeChart,
        LegendComponent: LegendVertical,
        flexChart: true,
      });
      expect(layout.processedLegendTitles).toEqual([
        ["Series 1", "50%"],
        "Series 2",
      ]);
    },
  );

  it.each<{ position: LegendPosition; isLegendBeforeChart: boolean }>([
    { position: "top", isLegendBeforeChart: true },
    { position: "bottom", isLegendBeforeChart: false },
  ])(
    "should stack a $position legend with the chart even when the area is wide",
    ({ position, isLegendBeforeChart }) => {
      const layout = getChartLayout({
        ...defaultInput,
        position,
        legendTitles: [["Series 1", "50%"], "Series 2"],
      });

      expect(layout).toMatchObject({
        type: "vertical",
        isLegendBeforeChart,
        LegendComponent: LegendHorizontal,
        isLegendSingleRow: true,
        flexChart: true,
      });
      expect(layout.processedLegendTitles).toEqual([
        "Series 1 50%",
        "Series 2",
      ]);
    },
  );

  it.each<LegendPosition>(["left", "right"])(
    "should show a %s legend on a tall card wide enough for a column where the automatic layout hides it",
    (position) => {
      const input = {
        ...defaultInput,
        width: 300,
        height: 600,
        gridSize: { width: 2, height: 8 },
      };

      expect(getChartLayout(input).type).toBe("small");
      expect(getChartLayout({ ...input, position })).toMatchObject({
        type: "horizontal",
        LegendComponent: LegendVertical,
      });
    },
  );

  it.each<LegendPosition>(["top", "bottom"])(
    "should show a %s legend on a wide card whose grid fits a row where the automatic layout hides it",
    (position) => {
      const input = {
        ...defaultInput,
        width: 200,
        height: 150,
        gridSize: { width: 6, height: 4 },
      };

      expect(getChartLayout(input).type).toBe("small");
      expect(getChartLayout({ ...input, position })).toMatchObject({
        type: "vertical",
        LegendComponent: LegendHorizontal,
      });
    },
  );

  it.each<LegendPosition>(["left", "right"])(
    "should hide a %s legend when the card is too narrow for a column",
    (position) => {
      const layout = getChartLayout({
        ...defaultInput,
        position,
        width: HIDE_HORIZONTAL_LEGEND_THRESHOLD,
        height: 600,
        gridSize: { width: 6, height: 8 },
      });

      expect(layout).toMatchObject({
        type: "small",
        LegendComponent: undefined,
      });
    },
  );

  it.each<LegendPosition>(["top", "bottom"])(
    "should hide a %s legend when the grid is too short for a row",
    (position) => {
      const layout = getChartLayout({
        ...defaultInput,
        position,
        gridSize: { width: 8, height: 3 },
      });

      expect(layout).toMatchObject({
        type: "small",
        LegendComponent: undefined,
      });
    },
  );

  it.each<LegendPosition>(["top", "bottom", "left", "right"])(
    "should hide a %s legend on a card too small for any legend",
    (position) => {
      const layout = getChartLayout({
        ...defaultInput,
        position,
        width: 200,
        height: 100,
      });

      expect(layout).toMatchObject({
        type: "small",
        LegendComponent: undefined,
      });
    },
  );
});
