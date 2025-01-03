import { formatValue } from "metabase/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import { cachedFormatter } from "../../../cartesian/utils/formatter";

import type { SankeyChartColumns, SankeyFormatters, SankeyNode } from "./types";

export const getSankeyFormatters = (
  columns: SankeyChartColumns,
  settings: ComputedVisualizationSettings,
): SankeyFormatters => {
  const source = cachedFormatter((value: RowValue) => {
    return String(
      formatValue(value, settings.column?.(columns.source.column) ?? {}),
    );
  });
  const target = cachedFormatter((value: RowValue) => {
    return String(
      formatValue(value, settings.column?.(columns.target.column) ?? {}),
    );
  });

  const node = (node: SankeyNode) =>
    !node.hasOutputs ? target(node.rawName) : source(node.rawName);

  return {
    node,
    source,
    target,
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
  };
};
