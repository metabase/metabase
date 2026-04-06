import { formatValue } from "metabase/lib/formatting";
import { formatNullable } from "metabase/lib/formatting/nullable";
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
