import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { RemappingHydratedDatasetColumn } from "metabase/visualizations/shared/types/data";
import { TooltipRowModel, VisualizationSettings } from "./types";

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

export const groupExcessiveTooltipRows = (
  rows: TooltipRowModel[],
  maxRows: number,
) => {
  if (rows.length <= maxRows) {
    return rows;
  }

  const groupStartingFromIndex = maxRows - 1;
  const result = rows.slice();
  const rowsToGroup = result.splice(groupStartingFromIndex);

  rowsToGroup.reduce(
    (grouped, current) => {
      if (
        typeof current.value === "number" &&
        typeof grouped.value === "number"
      ) {
        grouped.value += current.value;
      }
      return grouped;
    },
    {
      color: color("text-light"),
      name: `Other`,
      value: 0,
      formatter: rowsToGroup[0].formatter,
    },
  );
};
