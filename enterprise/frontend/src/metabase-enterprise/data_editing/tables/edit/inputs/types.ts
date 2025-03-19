import type { DatasetColumn, RowValue } from "metabase-types/api";

export interface EditingBodyPrimitiveProps {
  datasetColumn: DatasetColumn;
  initialValue: RowValue;
  onSubmit: (value: RowValue) => unknown;
  onCancel: () => unknown;
}
