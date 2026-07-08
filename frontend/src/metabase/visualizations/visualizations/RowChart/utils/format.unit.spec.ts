import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { BarData } from "metabase/visualizations/shared/components/RowChart/types";
import type {
  GroupedDatum,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { getLabelsFormatter } from "./format";

const itemColumn = createMockColumn({
  name: "ITEM",
  display_name: "Item",
  base_type: "type/Text",
});

const quantityColumn = createMockColumn({
  name: "TOTAL_QUANTITY",
  display_name: "Total Quantity",
  base_type: "type/Integer",
  effective_type: "type/Integer",
  semantic_type: "type/Quantity",
});

const paidColumn = createMockColumn({
  name: "TOTAL_PAID",
  display_name: "Total Paid",
  base_type: "type/Decimal",
  effective_type: "type/Decimal",
});

const chartColumns: CartesianChartColumns = {
  dimension: { column: itemColumn, index: 0 },
  metrics: [
    { column: paidColumn, index: 2 },
    { column: quantityColumn, index: 1 },
  ],
};

const settings = {
  "graph.label_value_formatting": "full",
  column: (column: DatasetColumn) => {
    if (column.name === "TOTAL_PAID") {
      return {
        column,
        currency: "USD",
        currency_style: "symbol",
        number_style: "currency",
      };
    }

    return {
      column,
      number_style: "decimal",
    };
  },
} as VisualizationSettings;

const getBar = (metricColumn: DatasetColumn) =>
  ({
    series: {
      seriesInfo: {
        metricColumn,
      },
    },
  }) as BarData<GroupedDatum, SeriesInfo>;

describe("RowChart format", () => {
  describe("getLabelsFormatter", () => {
    it("formats data labels using the current series metric column", () => {
      const formatter = getLabelsFormatter(chartColumns, settings);

      expect(formatter(769.76, getBar(paidColumn))).toBe("$769.76");
      expect(formatter(409, getBar(quantityColumn))).toBe("409");
    });

    it("falls back to the first metric when no bar is provided", () => {
      const formatter = getLabelsFormatter(chartColumns, settings);

      expect(formatter(409)).toBe("$409.00");
    });
  });
});
