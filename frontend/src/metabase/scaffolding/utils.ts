import type { ContentTranslationFunction } from "metabase/i18n/types";
import { formatValue } from "metabase/lib/formatting";
import type { DatasetColumn, RowValue } from "metabase-types/api";

export function renderValue(
  tc: ContentTranslationFunction,
  value: RowValue,
  column: DatasetColumn,
) {
  if (value === undefined) {
    return "";
  }

  if (!column) {
    return String(value);
  }

  return formatValue(tc(value), {
    ...column.settings,
    column,
    type: "cell",
    jsx: true,
    rich: true,
  });
}
