import type {
  DatasetColumn,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { GAUGE_CHART_DEFINITION } from "./definition";

const { checkRenderable } = GAUGE_CHART_DEFINITION;

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];

describe("GAUGE_CHART_DEFINITION", () => {
  describe("gauge.segments widget", () => {
    it("formats the bounds like the gauge's labels", () => {
      const series = createSeries({
        cols: [...COLS, createMockColumn({ name: "total" })],
        rows: [[50, 80]],
      });

      const props = GAUGE_CHART_DEFINITION.settings?.[
        "gauge.segments"
      ]?.getProps?.(
        series,
        { column: getMockColumnSettings },
        jest.fn(),
        undefined,
        jest.fn(),
      );

      expect(props?.formatOptions).toEqual({ prefix: "count:" });
    });
  });

  describe("checkRenderable", () => {
    it("renders when a range's bound will never resolve", () => {
      const series = createSeries({
        referenced_entities: createMockFailedReferencedEntitiesResults(),
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
        referenced_entities: createMockReferencedEntitiesResults({
          column: "goal",
          value: 250,
        }),
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

function getMockColumnSettings(column: DatasetColumn) {
  return { prefix: `${column.name}:` };
}

function createSeries(
  data: Partial<Parameters<typeof createMockDatasetData>[0]> = {},
): Series {
  return [
    createMockSingleSeries(createMockCard({ display: "gauge" }), {
      data: createMockDatasetData({ cols: COLS, rows: [[50]], ...data }),
    }),
  ];
}
