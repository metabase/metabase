import { createMockVisualizationSettings } from "metabase-types/api/mocks";

import { getSizeAdjustedSettings } from "./settings-adjustments";

describe("getSizeAdjustedSettings", () => {
  describe("pixel fallback (no gridSize)", () => {
    it.each([
      { width: 499, height: 400, expected: false },
      { width: 500, height: 400, expected: true },
      { width: 800, height: 249, expected: false },
      { width: 800, height: 250, expected: true },
    ])(
      "resolves auto axis labels together to $expected at $width x $height",
      ({ width, height, expected }) => {
        const settings = getSizeAdjustedSettings({
          settings: createMockVisualizationSettings({
            "graph.x_axis.labels_enabled": "auto",
            "graph.y_axis.labels_enabled": "auto",
          }),
          width,
          height,
        });

        expect(settings["graph.y_axis.labels_enabled"]).toBe(expected);
        expect(settings["graph.x_axis.labels_enabled"]).toBe(expected);
      },
    );

    it.each([
      { width: 149, height: 200, expected: "cardinal" },
      { width: 200, height: 149, expected: "cardinal" },
      { width: 150, height: 150, expected: undefined },
    ])(
      "interpolates the line at $width x $height",
      ({ width, height, expected }) => {
        const settings = getSizeAdjustedSettings({
          settings: createMockVisualizationSettings(),
          width,
          height,
        });

        expect(settings["line.interpolate"]).toBe(expected);
      },
    );

    it.each([
      { height: 149, expected: false },
      { height: 150, expected: undefined },
    ])("hides the y-axis at height $height", ({ height, expected }) => {
      const settings = getSizeAdjustedSettings({
        settings: createMockVisualizationSettings(),
        width: 800,
        height,
      });

      expect(settings["graph.y_axis.axis_enabled"]).toBe(expected);
    });
  });

  describe("gridSize", () => {
    it.each([
      { gridSize: { width: 12, height: 6 }, expected: true },
      { gridSize: { width: 11, height: 6 }, expected: false },
      { gridSize: { width: 12, height: 5 }, expected: false },
      { gridSize: { width: 11, height: 5 }, expected: false },
    ])(
      "resolves auto axis labels together to $expected at grid $gridSize.width x $gridSize.height",
      ({ gridSize, expected }) => {
        const settings = getSizeAdjustedSettings({
          settings: createMockVisualizationSettings({
            "graph.x_axis.labels_enabled": "auto",
            "graph.y_axis.labels_enabled": "auto",
          }),
          width: 100,
          height: 100,
          gridSize,
        });

        expect(settings["graph.y_axis.labels_enabled"]).toBe(expected);
        expect(settings["graph.x_axis.labels_enabled"]).toBe(expected);
      },
    );

    it("uses gridSize even when pixel size would produce the opposite result", () => {
      const settings = getSizeAdjustedSettings({
        settings: createMockVisualizationSettings({
          "graph.x_axis.labels_enabled": "auto",
          "graph.y_axis.labels_enabled": "auto",
        }),
        width: 800,
        height: 400,
        gridSize: { width: 11, height: 5 },
      });

      expect(settings["graph.y_axis.labels_enabled"]).toBe(false);
      expect(settings["graph.x_axis.labels_enabled"]).toBe(false);
    });

    it.each([
      { gridSize: { width: 3, height: 4 }, expected: "cardinal" },
      { gridSize: { width: 4, height: 3 }, expected: "cardinal" },
      { gridSize: { width: 4, height: 4 }, expected: undefined },
    ])(
      "interpolates the line at grid $gridSize.width x $gridSize.height",
      ({ gridSize, expected }) => {
        const settings = getSizeAdjustedSettings({
          settings: createMockVisualizationSettings(),
          width: 800,
          height: 400,
          gridSize,
        });

        expect(settings["line.interpolate"]).toBe(expected);
      },
    );

    it.each([
      { gridSize: { width: 12, height: 3 }, expected: false },
      { gridSize: { width: 12, height: 4 }, expected: undefined },
    ])(
      "hides the y-axis at grid height $gridSize.height",
      ({ gridSize, expected }) => {
        const settings = getSizeAdjustedSettings({
          settings: createMockVisualizationSettings(),
          width: 800,
          height: 400,
          gridSize,
        });

        expect(settings["graph.y_axis.axis_enabled"]).toBe(expected);
      },
    );
  });

  it.each([true, false] as const)(
    "leaves an explicit y-axis title setting of %s unchanged",
    (labelsEnabled) => {
      const settings = getSizeAdjustedSettings({
        settings: createMockVisualizationSettings({
          "graph.y_axis.labels_enabled": labelsEnabled,
        }),
        width: 400,
        height: 200,
      });

      expect(settings["graph.y_axis.labels_enabled"]).toBe(labelsEnabled);
    },
  );

  it.each([true, false] as const)(
    "leaves an explicit x-axis title setting of %s unchanged",
    (labelsEnabled) => {
      const settings = getSizeAdjustedSettings({
        settings: createMockVisualizationSettings({
          "graph.x_axis.labels_enabled": labelsEnabled,
        }),
        width: 400,
        height: 200,
      });

      expect(settings["graph.x_axis.labels_enabled"]).toBe(labelsEnabled);
    },
  );
});
