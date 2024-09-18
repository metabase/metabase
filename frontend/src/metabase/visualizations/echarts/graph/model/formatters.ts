import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import { cachedFormatter } from "../../cartesian/utils/formatter";

import type { SankeyChartColumns, SankeyFormatters } from "./types";

export const getSankeyFormatters = (
  columns: SankeyChartColumns,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): SankeyFormatters => {
  return {
    value: cachedFormatter((value: RowValue) => {
      if (typeof value !== "number") {
        return "";
      }

      return renderingContext.formatValue(
        value,
        settings.column?.(columns.value.column) ?? {},
      );
    }),
    source: cachedFormatter((value: RowValue) => {
      return renderingContext.formatValue(
        value,
        settings.column?.(columns.source.column) ?? {},
      );
    }),
    target: cachedFormatter((value: RowValue) => {
      return renderingContext.formatValue(
        value,
        settings.column?.(columns.target.column) ?? {},
      );
    }),
  };
};
