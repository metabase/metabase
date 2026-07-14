import { formatValue } from "metabase/formatting";
import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type { ColumnSettings, DatasetColumn } from "metabase-types/api";

export const formatValueForTooltip = ({
  value,
  column,
  settings,
  isAlreadyScaled,
}: {
  value?: unknown;
  column?: RemappingHydratedDatasetColumn | DatasetColumn | null;
  settings?: ComputedVisualizationSettings;
  isAlreadyScaled?: boolean;
}) => {
  const options: ColumnSettings = {
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    type: "tooltip",
    majorWidth: 0,
  };

  if (isAlreadyScaled) {
    options.scale = 1;
  }

  return formatValue(value, options) ?? NULL_DISPLAY_VALUE;
};
