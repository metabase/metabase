import { formatValue } from "metabase/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import { cachedFormatter } from "../../../cartesian/utils/formatter";

import type { SankeyChartColumns, SankeyFormatters } from "./types";

export const getSankeyFormatters = (
  columns: SankeyChartColumns,
  settings: ComputedVisualizationSettings,
): SankeyFormatters => {
  return {
    value: cachedFormatter((value: RowValue) => {
      if (typeof value !== "number") {
        return "";
      }

      return String(
        formatValue(value, settings.column?.(columns.value.column) ?? {}),
      );
    }),
    valueCompact: cachedFormatter((value: RowValue) => {
      if (typeof value !== "number") {
        return "";
      }

      return String(
        formatValue(value, {
          ...(settings.column?.(columns.value.column) ?? {}),
          compact: true,
        }),
      );
    }),
    node: cachedFormatter((value: RowValue) => {
      return String(
        formatValue(value, settings.column?.(columns.source.column) ?? {}),
      );
    }),
  };
};
