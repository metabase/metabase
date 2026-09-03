import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { SCALAR_CHART_DEFINITION } from "./definition";

const { checkRenderable } = SCALAR_CHART_DEFINITION;

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];

describe("SCALAR_CHART_DEFINITION", () => {
  describe("scalar.segments widget", () => {
    it("hands the segments editor the data and query its dynamic bounds resolve against", () => {
      const series = createSeries();
      const [{ card, data }] = series;

      const props = SCALAR_CHART_DEFINITION.settings?.[
        "scalar.segments"
      ]?.getProps?.(series, {}, jest.fn(), undefined, jest.fn());

      expect(props).toEqual({
        canRemoveAll: true,
        data,
        datasetQuery: card.dataset_query,
      });
    });
  });

  describe("checkRenderable", () => {
    it("accepts static ranges, open-ended ones included", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          "scalar.segments": [
            { min: null, max: 100, color: "red" },
            { min: 100, max: null, color: "green" },
          ],
        }),
      ).not.toThrow();
    });

    it("accepts a range that is still resolving", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          "scalar.segments": [
            {
              min: { type: "card", id: 9, column: "goal" },
              max: null,
              color: "red",
            },
          ],
        }),
      ).not.toThrow();
    });

    it("accepts a range bound to a column of this question", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          "scalar.segments": [{ min: "count", max: null, color: "red" }],
        }),
      ).not.toThrow();
    });

    it("refuses to render when a range's bound will never resolve", () => {
      const series = createSeries({
        referenced_entities: {
          card: { 9: { status: "failed", error: "boom" } },
        },
      });

      expect(() =>
        checkRenderable(series, {
          "scalar.segments": [
            { min: null, max: 100, color: "red" },
            {
              min: 100,
              max: { type: "measure", id: 4, column: "goal" },
              color: "yellow",
            },
            {
              min: { type: "card", id: 9, column: "goal" },
              max: null,
              color: "green",
            },
          ],
        }),
      ).toThrow(
        "Couldn't load a value one of this chart's color ranges depends on.",
      );
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
          "scalar.segments": [
            {
              min: { type: "card", id: 9, column: "goal" },
              max: null,
              color: "red",
            },
          ],
        }),
      ).toThrow(
        "Couldn't load a value one of this chart's color ranges depends on.",
      );
    });

    it("refuses to render a range bound to a column the question no longer has", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          "scalar.segments": [{ min: "missing", max: null, color: "red" }],
        }),
      ).toThrow(
        "Couldn't load a value one of this chart's color ranges depends on.",
      );
    });

    it("tolerates malformed persisted segments", () => {
      // deliberately malformed input
      const malformedSettings = {
        "scalar.segments": [null, 5, { min: {}, max: [1], color: "red" }],
      } as unknown as VisualizationSettings;

      expect(() =>
        checkRenderable(createSeries(), malformedSettings),
      ).not.toThrow();
    });
  });
});

function createSeries(
  data: Partial<Parameters<typeof createMockDatasetData>[0]> = {},
): Series {
  return [
    createMockSingleSeries(createMockCard({ display: "scalar" }), {
      data: createMockDatasetData({ cols: COLS, rows: [[50]], ...data }),
    }),
  ];
}
