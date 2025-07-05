import { memoize } from "metabase/common/hooks/use-memoized-callback";
import { formatValue } from "metabase/lib/formatting";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import type { RadarColumns, RadarFormatters } from "./types";

export function getRadarFormatters(
  radarColumns: RadarColumns,
  settings: ComputedVisualizationSettings,
): RadarFormatters {
  const dimensionFormatter = memoize((value: any): string => {
    return String(
      formatValue(value, settings.column?.(radarColumns.dimension) ?? {}),
    );
  });

  const metricsFormatters = radarColumns.metrics.map((metric) =>
    memoize((value: number): string => {
      if (typeof value !== "number") {
        return "";
      }
      return String(formatValue(value, settings.column?.(metric) ?? {}));
    }),
  );

  return {
    dimension: dimensionFormatter,
    metrics: metricsFormatters,
  };
}
