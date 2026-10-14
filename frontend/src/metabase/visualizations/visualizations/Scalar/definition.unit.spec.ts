import type { DatasetColumn, Series } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { SCALAR_CHART_DEFINITION } from "./definition";

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

    it("formats the bounds like the number it shows", () => {
      const series = createSeries({
        cols: [...COLS, createMockColumn({ name: "total" })],
        rows: [[50, 80]],
      });

      const props = SCALAR_CHART_DEFINITION.settings?.[
        "scalar.segments"
      ]?.getProps?.(
        series,
        { "scalar.field": "total", column: getMockColumnSettings },
        jest.fn(),
        undefined,
        jest.fn(),
      );

      expect(props?.formatOptions).toEqual({ prefix: "total:" });
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
    createMockSingleSeries(createMockCard({ display: "scalar" }), {
      data: createMockDatasetData({ cols: COLS, rows: [[50]], ...data }),
    }),
  ];
}
