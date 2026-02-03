import { getColorsForValues } from "metabase/lib/colors/charts";
import type { VisualizationSettings } from "metabase-types/api";

import { getSeriesColors } from "./colors";

jest.mock("metabase/lib/colors/charts");

const mockGetColorsForValues = getColorsForValues as jest.MockedFunction<
  typeof getColorsForValues
>;

describe("getSeriesColors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetColorsForValues.mockReturnValue({
      "Series 1": "#509EE3",
      "Series 2": "#88BF4D",
    });
  });

  it("should handle undefined series_settings entries (metabase#66490)", () => {
    const settings: Partial<VisualizationSettings> = {
      series_settings: {
        "Series 1": undefined,
        "Series 2": { color: "#FF0000" },
      },
    };

    const series = [
      {
        seriesKey: "Series 1",
        seriesName: "Series 1",
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      },
      {
        seriesKey: "Series 2",
        seriesName: "Series 2",
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      },
    ];

    const result = getSeriesColors(settings, series);

    // Verify getColorsForValues was called with correct parameters
    expect(mockGetColorsForValues).toHaveBeenCalledWith(
      ["Series 1", "Series 2"],
      {
        "Series 2": "#FF0000",
      },
    );

    expect(result).toEqual({
      "Series 1": "#509EE3",
      "Series 2": "#88BF4D",
    });
  });

  it("should filter out undefined values from settings color mapping", () => {
    const settings = {
      series_settings: {
        "Series 1": undefined,
        "Series 2": undefined,
        "Series 3": { color: undefined },
      },
    };

    const series = [
      {
        seriesKey: "Series 1",
        seriesName: "Series 1",
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      },
      {
        seriesKey: "Series 2",
        seriesName: "Series 2",
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      },
      {
        seriesKey: "Series 3",
        seriesName: "Series 3",
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      },
    ];

    getSeriesColors(settings, series);

    // When all series_settings are undefined or have undefined colors,
    // the mapping should be empty
    expect(mockGetColorsForValues).toHaveBeenCalledWith(
      ["Series 1", "Series 2", "Series 3"],
      {},
    );
  });

  it("should work with valid series_settings", () => {
    const settings = {
      series_settings: {
        "Series 1": { color: "#FF0000" },
        "Series 2": { color: "#00FF00" },
      },
    };

    const series = [
      {
        seriesKey: "Series 1",
        seriesName: "Series 1",
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      },
      {
        seriesKey: "Series 2",
        seriesName: "Series 2",
        xAccessor: (d: any) => d.x,
        yAccessor: (d: any) => d.y,
      },
    ];

    getSeriesColors(settings, series);

    expect(mockGetColorsForValues).toHaveBeenCalledWith(
      ["Series 1", "Series 2"],
      {
        "Series 1": "#FF0000",
        "Series 2": "#00FF00",
      },
    );
  });
});
