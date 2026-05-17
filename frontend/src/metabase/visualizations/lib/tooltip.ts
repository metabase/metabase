import { formatNullable } from "metabase/utils/formatting/nullable";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { getFormattingOptionsWithoutScaling } from "../echarts/cartesian/model/util";

export const formatValueForTooltip = ({
  value,
  column,
  settings,
}: {
  value?: unknown;
  column?: DatasetColumn;
  settings?: VisualizationSettings;
}) => {
  const nullableValue = formatNullable(value);

  // since we already transformed the dataset values, we do not need to
  // consider scaling anymore
  const options = getFormattingOptionsWithoutScaling({
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    weekday_enabled: true,
    type: "tooltip",
    majorWidth: 0,
  });
  return formatValue(nullableValue, options);
};
