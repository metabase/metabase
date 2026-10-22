import { getNullDisplayValue } from "metabase/utils/constants";
import { isEmpty } from "metabase/utils/validate";
import { formatValue } from "metabase/value-formatting";
import type { DatasetColumn, RowValue } from "metabase-types/api";

export const getColumnValueFormatter = () => {
  return (value: RowValue, column: DatasetColumn) =>
    isEmpty(value)
      ? getNullDisplayValue()
      : String(formatValue(value, { column }));
};
