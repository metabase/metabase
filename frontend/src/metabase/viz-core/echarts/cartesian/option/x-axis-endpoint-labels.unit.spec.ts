import { createMockChartLayout } from "__support__/echarts";

import type { NumericXAxisModel } from "../model/types";

import {
  getCategoryEndpointLabelOptions,
  getNumericEndpointLabelOptions,
  getXAxisEndpointInset,
} from "./x-axis-endpoint-labels";

describe("getXAxisEndpointInset", () => {
  it.each([
    { plotWidth: 299, inset: 8 },
    { plotWidth: 300, inset: 16 },
    { plotWidth: 899, inset: 16 },
    { plotWidth: 900, inset: 24 },
  ])(
    "uses a $inset px inset for a $plotWidth px plot",
    ({ plotWidth, inset }) => {
      expect(getXAxisEndpointInset(plotWidth)).toBe(inset);
    },
  );
});

describe("getCategoryEndpointLabelOptions", () => {
  const setup = ({
    datasetLength = 4,
    boundaryWidth = 400,
    firstXTickWidth = 20,
    lastXTickWidth = 20,
    axisEnabledSetting = true as const,
  }: {
    datasetLength?: number;
    boundaryWidth?: number;
    firstXTickWidth?: number;
    lastXTickWidth?: number;
    axisEnabledSetting?: "compact" | "rotate-45" | "rotate-90" | boolean;
  } = {}) =>
    getCategoryEndpointLabelOptions(
      datasetLength,
      createMockChartLayout({
        boundaryWidth,
        axisEnabledSetting,
        ticksDimensions: { firstXTickWidth, lastXTickWidth },
      }),
      String,
    );

  it("keeps endpoint labels visible and centered when they fit inside the inset", () => {
    // 4 bands of 100px: a 20px label centered at 50px sits 40px from the edge.
    expect(setup()).toEqual({
      showMinLabel: true,
      showMaxLabel: true,
      interval: expect.any(Function),
    });
  });

  it("aligns the first label inward when centering it would cross the inset", () => {
    // Centered at 50px, a 80px label would start 10px from the edge (< 16px).
    expect(setup({ firstXTickWidth: 80 })).toEqual({
      showMinLabel: true,
      showMaxLabel: true,
      alignMinLabel: "left",
      interval: expect.any(Function),
    });
  });

  it("aligns the last label inward independently of the first", () => {
    expect(setup({ lastXTickWidth: 80 })).toEqual({
      showMinLabel: true,
      showMaxLabel: true,
      alignMaxLabel: "right",
      interval: expect.any(Function),
    });
  });

  it("pushes aligned labels to the inset when bands are narrower than it", () => {
    // 40 bands of 10px: the first tick is 5px from the edge, 11px short of the 16px inset.
    expect(
      setup({ datasetLength: 40, firstXTickWidth: 30, lastXTickWidth: 30 }),
    ).toEqual({
      showMinLabel: true,
      showMaxLabel: true,
      alignMinLabel: "left",
      alignMaxLabel: "right",
      padding: [0, 11],
      interval: expect.any(Function),
    });
  });

  describe("interior label visibility", () => {
    // 10 bands of 40px in a 400px plot (inset 16): ticks at 20, 60, 100, ..., 380.
    const labelWidths: Record<string, number> = {
      first: 60,
      last: 60,
      short: 20,
      wide: 50,
    };
    const measure = (text: string) => labelWidths[text] ?? 20;
    const getInterval = () => {
      const options = getCategoryEndpointLabelOptions(
        10,
        createMockChartLayout({
          boundaryWidth: 400,
          ticksDimensions: {
            firstXTickWidth: 60,
            lastXTickWidth: 60,
            getXTickWidth: measure,
          },
        }),
        (value) => value,
      );
      const interval = options.interval;
      if (typeof interval !== "function") {
        throw new Error("expected an interval callback");
      }
      return interval;
    };

    it("always keeps both endpoint labels", () => {
      const interval = getInterval();
      expect(interval(0, "first")).toBe(true);
      expect(interval(9, "last")).toBe(true);
    });

    it("hides an interior label that would collide with the inward-aligned first label", () => {
      // The first label spans 20..80; a 50px label centered at 60 spans 35..85.
      expect(getInterval()(1, "wide")).toBe(false);
    });

    it("hides an interior label that would collide with the inward-aligned last label", () => {
      // The last label spans 320..380; a 50px label centered at 340 spans 315..365.
      expect(getInterval()(8, "wide")).toBe(false);
    });

    it("keeps interior labels that clear both endpoint labels", () => {
      const interval = getInterval();
      expect(interval(2, "short")).toBe(true);
      expect(interval(7, "short")).toBe(true);
    });
  });

  it.each(["rotate-45", "rotate-90", false] as const)(
    "leaves %s axes to the default layout",
    (axisEnabledSetting) => {
      expect(setup({ axisEnabledSetting, firstXTickWidth: 80 })).toEqual({});
    },
  );

  it("leaves a single category centered", () => {
    expect(setup({ datasetLength: 1, firstXTickWidth: 380 })).toEqual({});
  });
});

describe("getNumericEndpointLabelOptions", () => {
  const numericAxis = (isPadded: boolean): NumericXAxisModel => ({
    axisType: "value",
    extent: [0, 100],
    interval: 1,
    intervalsCount: 100,
    isPadded,
    formatter: String,
    toEChartsAxisValue: (value) => Number(value),
    fromEChartsAxisValue: (value) => value,
  });

  it("keeps the outermost native ticks of an unpadded axis ahead of their neighbours", () => {
    expect(
      getNumericEndpointLabelOptions(
        numericAxis(false),
        createMockChartLayout({ axisEnabledSetting: true }),
      ),
    ).toEqual({ showMinLabel: true, showMaxLabel: true });
  });

  it("leaves padded axes alone, whose extent ends are blank labels", () => {
    expect(
      getNumericEndpointLabelOptions(
        numericAxis(true),
        createMockChartLayout({ axisEnabledSetting: true }),
      ),
    ).toEqual({});
  });

  it("leaves rotated axes to the default layout", () => {
    expect(
      getNumericEndpointLabelOptions(
        numericAxis(false),
        createMockChartLayout({ axisEnabledSetting: "rotate-45" }),
      ),
    ).toEqual({});
  });
});
