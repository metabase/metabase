import { formatValue } from "metabase/lib/formatting";
import type { VisualizationSettings } from "metabase-types/api";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";

export const formatValueForTooltip = ({
  value,
  column,
  settings,
}: {
  value?: unknown;
  column?: RemappingHydratedDatasetColumn;
  settings?: VisualizationSettings;
}) =>
  formatValue(value, {
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    type: "tooltip",
    majorWidth: 0,
  });
