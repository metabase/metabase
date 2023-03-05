import { t } from "ttag";

import Table from "metabase/visualizations/visualizations/Table";
import { formatColumn } from "metabase/lib/formatting";
import {
  DatasetColumn,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

export const getTitleForColumn = (
  columnIndex: number,
  columns: DatasetColumn[],
  series: Series,
  settings: VisualizationSettings,
) => {
  const column = columns[columnIndex];

  const isPivoted = Table.isPivoted(series, settings);
  if (isPivoted) {
    return formatColumn(column) || (columnIndex !== 0 ? t`Unset` : null);
  } else {
    return (
      settings.column(column)["_column_title_full"] || formatColumn(column)
    );
  }
};
