import { getSeriesColors } from "./series";

describe("getSeriesColors", () => {
  const mockSeriesKeys = ["Series A", "Series B", "Series C"];
  const mockDefaultKeys = ["Default A", "Default B"];

  it("should return colors when no series settings are provided", () => {
    const settings = {};
    const result = getSeriesColors(mockSeriesKeys, settings, mockDefaultKeys);

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual(mockSeriesKeys);
  });

  it("should assign custom colors from series settings", () => {
    const settings = {
      series_settings: {
        "Series A": { color: "#FF0000" },
        "Series B": { color: "#00FF00" },
      },
    };

    const result = getSeriesColors(mockSeriesKeys, settings, mockDefaultKeys);

    expect(result["Series A"]).toBe("#FF0000");
    expect(result["Series B"]).toBe("#00FF00");
  });

  it("should assign colors to custom titles when series has custom title", () => {
    // Test with custom titles as part of the series keys
    const seriesKeysWithCustomTitles = [
      "Series A",
      "Custom Title A",
      "Series B",
    ];
    const settings = {
      series_settings: {
        "Series A": {
          color: "#FF0000",
          title: "Custom Title A",
        },
        "Series B": {
          color: "#00FF00",
          title: "Custom Title B",
        },
      },
    };

    const result = getSeriesColors(
      seriesKeysWithCustomTitles,
      settings,
      mockDefaultKeys,
    );

    // Original series key should have the color
    expect(result["Series A"]).toBe("#FF0000");
    expect(result["Series B"]).toBe("#00FF00");

    // Custom title should also be assigned the same color when it's in the keys
    expect(result["Custom Title A"]).toBe("#FF0000");
  });

  it("should handle series with custom title but no color", () => {
    const settings = {
      series_settings: {
        "Series A": { title: "Custom Title Only" },
      },
    };

    const result = getSeriesColors(mockSeriesKeys, settings, mockDefaultKeys);

    // Should not assign any color mapping for custom title when no color is provided
    expect(result["Custom Title Only"]).toBeUndefined();
  });

  it("should use legacy colors when available and no series settings conflict", () => {
    const settings = {
      "graph.colors": ["#LEGACY1", "#LEGACY2", "#LEGACY3"],
    };

    const result = getSeriesColors(mockSeriesKeys, settings, mockDefaultKeys);

    expect(result["Series A"]).toBe("#LEGACY1");
    expect(result["Series B"]).toBe("#LEGACY2");
    expect(result["Series C"]).toBe("#LEGACY3");
  });

  it("should prioritize series settings over legacy colors", () => {
    const settings = {
      series_settings: {
        "Series A": { color: "#SERIES_COLOR" },
      },
      "graph.colors": ["#LEGACY1", "#LEGACY2", "#LEGACY3"],
    };

    const result = getSeriesColors(mockSeriesKeys, settings, mockDefaultKeys);

    expect(result["Series A"]).toBe("#SERIES_COLOR");
    expect(result["Series B"]).toBe("#LEGACY2");
    expect(result["Series C"]).toBe("#LEGACY3");
  });

  it("should handle complex scenario with mixed custom titles and colors", () => {
    const seriesKeysWithTitles = [
      "Series A",
      "Revenue",
      "Series B",
      "Series C",
    ];
    const settings = {
      series_settings: {
        "Series A": {
          color: "#RED",
          title: "Revenue",
        },
        "Series B": {
          color: "#BLUE",
          title: "Profit",
        },
        "Series C": {
          title: "Cost", // No color, should not create color mapping
        },
      },
      "graph.colors": ["#LEGACY1", "#LEGACY2", "#LEGACY3", "#LEGACY4"],
    };

    const result = getSeriesColors(
      seriesKeysWithTitles,
      settings,
      mockDefaultKeys,
    );

    // Series with custom colors should be assigned those colors
    expect(result["Series A"]).toBe("#RED");
    expect(result["Revenue"]).toBe("#RED"); // Custom title gets the same color when it's in keys
    expect(result["Series B"]).toBe("#BLUE");

    // Series with title but no color should use legacy/auto-assigned color
    expect(result["Series C"]).toBeDefined();
  });

  it("should create internal assignments for custom titles that can be referenced", () => {
    // This test verifies the internal logic that creates assignments for custom titles
    // even when they're not in the output keys
    const settings = {
      series_settings: {
        "Original Key": {
          color: "#CUSTOM_COLOR",
          title: "Display Title",
        },
      },
    };

    // When the custom title is later used as a key, it should get the assigned color
    const seriesKeysWithTitle = ["Display Title", "Other Series"];
    const result = getSeriesColors(
      seriesKeysWithTitle,
      settings,
      mockDefaultKeys,
    );

    expect(result["Display Title"]).toBe("#CUSTOM_COLOR");
  });
});
