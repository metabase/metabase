import { formatValue } from "metabase/lib/formatting";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

export const formatValueForTooltip = ({
  value,
  column,
  settings,
}: {
  value?: unknown;
  column?: RemappingHydratedDatasetColumn | DatasetColumn | null;
  settings?: ComputedVisualizationSettings;
}) =>
  formatValue(value, {
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    type: "tooltip",
    majorWidth: 0,
  });
