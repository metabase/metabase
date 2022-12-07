import { MouseEvent } from "react";
import { Column } from "metabase-types/types/Dataset";
import { formatValue } from "metabase/lib/formatting";
import { VisualizationSettings } from "./types";

export const formatValueForTooltip = ({
  value,
  column,
  settings,
}: {
  value?: unknown;
  column?: Column;
  settings?: VisualizationSettings;
}) =>
  formatValue(value, {
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    type: "tooltip",
    majorWidth: 0,
  });
