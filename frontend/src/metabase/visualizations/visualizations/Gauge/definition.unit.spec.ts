import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { GAUGE_CHART_DEFINITION } from "./definition";

const { checkRenderable } = GAUGE_CHART_DEFINITION;

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];

describe("GAUGE_CHART_DEFINITION", () => {
  describe("checkRenderable", () => {
    it("accepts static ranges", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          "gauge.segments": [{ min: 0, max: 100, color: "red" }],
        }),
      ).not.toThrow();
    });

    it("accepts a range that is still resolving", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          "gauge.segments": [
            {
              min: 0,
              max: { type: "card", id: 9, column: "goal" },
              color: "red",
            },
          ],
        }),
      ).not.toThrow();
    });

    it("accepts a range whose answer lacks its column, so the chart can re-ask", () => {
      const series = createSeries({
        referenced_entities: {
          card: {
            9: {
              status: "completed",
              data: {
                cols: [createMockColumn({ name: "other" })],
                rows: [[1]],
              },
            },
          },
        },
      });

      expect(() =>
        checkRenderable(series, {
          "gauge.segments": [
            {
              min: 0,
              max: { type: "card", id: 9, column: "goal" },
              color: "red",
            },
          ],
        }),
      ).not.toThrow();
    });

    it("refuses to render when a referenced value is not a number", () => {
      const series = createSeries({
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
          "gauge.segments": [
            {
              min: 0,
              max: { type: "card", id: 9, column: "goal" },
              color: "red",
            },
          ],
        }),
      ).toThrow("Couldn't load a value one of this gauge's ranges depends on.");
    });

    it("refuses to render a range bound to a column the question no longer has", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          "gauge.segments": [{ min: 0, max: "missing", color: "red" }],
        }),
      ).toThrow("Couldn't load a value one of this gauge's ranges depends on.");
    });

    it("refuses to render when a range's bound will never resolve", () => {
      const series = createSeries({
        referenced_entities: {
          card: { 9: { status: "failed", error: "boom" } },
        },
      });

      expect(() =>
        checkRenderable(series, {
          "gauge.segments": [
            { min: 0, max: 100, color: "red" },
            {
              min: 100,
              max: { type: "card", id: 9, column: "goal" },
              color: "green",
            },
          ],
        }),
      ).toThrow("Couldn't load a value one of this gauge's ranges depends on.");
    });

    it("tolerates malformed persisted segments", () => {
      // deliberately malformed input
      const malformedSettings = {
        "gauge.segments": [null, 5, { min: {}, max: [1], color: "red" }],
      } as unknown as VisualizationSettings;

      expect(() =>
        checkRenderable(createSeries(), malformedSettings),
      ).not.toThrow();
    });

    it("requires a numeric column", () => {
      const series = [
        createMockSingleSeries(createMockCard({ display: "gauge" }), {
          data: createMockDatasetData({
            cols: [createMockColumn({ name: "name", base_type: "type/Text" })],
            rows: [["nope"]],
          }),
        }),
      ];

      expect(() => checkRenderable(series, {})).toThrow(
        "Gauge visualization requires a number.",
      );
    });
  });

  describe("gauge.range default", () => {
    it("spans the resolved bounds of every range", () => {
      const series = createSeries({
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
      const settings: VisualizationSettings = {
        "gauge.segments": [
          { min: 0, max: 100, color: "red" },
          {
            min: 100,
            max: { type: "card", id: 9, column: "goal" },
            color: "green",
          },
        ],
      };

      expect(
        GAUGE_CHART_DEFINITION.settings?.["gauge.range"]?.getDefault?.(
          series,
          settings,
          {},
        ),
      ).toEqual([0, 250]);
    });
  });
});

function createSeries(
  data: Partial<Parameters<typeof createMockDatasetData>[0]> = {},
): Series {
  return [
    createMockSingleSeries(createMockCard({ display: "gauge" }), {
      data: createMockDatasetData({ cols: COLS, rows: [[50]], ...data }),
    }),
  ];
}
