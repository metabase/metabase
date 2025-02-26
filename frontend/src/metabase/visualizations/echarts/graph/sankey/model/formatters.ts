import { memoize } from "metabase/hooks/use-memoized-callback";
import { formatValue } from "metabase/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import type { SankeyChartColumns, SankeyFormatters, SankeyNode } from "./types";

export const getSankeyFormatters = (
  columns: SankeyChartColumns,
  settings: ComputedVisualizationSettings,
): SankeyFormatters => {
  const source = memoize(value => {
    return String(
      formatValue(value, settings.column?.(columns.source.column) ?? {}),
    );
  });
  const target = memoize(value => {
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
    value: memoize(value => {
      if (typeof value !== "number") {
        return "";
      }
      return String(
        formatValue(value, settings.column?.(columns.value.column) ?? {}),
      );
    }),
    valueCompact: memoize(value => {
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
