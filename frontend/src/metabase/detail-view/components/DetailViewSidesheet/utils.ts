import { extractRemappedColumns } from "metabase/viz-core";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import { findColumnIndexesForColumnSettings } from "metabase-lib/v1/queries/utils/dataset";
import type {
  Dataset,
  DatasetColumn,
  RowValues,
  Table,
  TableColumnOrderSetting,
} from "metabase-types/api";

export function extractData(
  dataset: Dataset | undefined,
  columnsFromProp: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[] | undefined,
  rowFromProps: RowValues | undefined,
) {
  const data = dataset ? extractRemappedColumns(dataset.data) : undefined;
  const unsortedColumns = data?.cols ?? columnsFromProp;
  const columnIndexes = columnSettings
    ? findColumnIndexesForColumnSettings(
        unsortedColumns,
        columnSettings.filter(({ enabled }) => enabled),
      ).filter((columnIndex: number) => columnIndex >= 0)
    : unsortedColumns.map((_value, index) => index);
  const columns = columnIndexes.map((index) => unsortedColumns[index]);
  const rowFromQuery = (data?.rows ?? [])[0];
  const unsortedRow = rowFromProps ?? rowFromQuery;
  const row = unsortedRow
    ? columnIndexes.map((index) => unsortedRow[index])
    : undefined;

  return { columns, row };
}

export function getModelId(table: Table | undefined) {
  return table?.type === "model"
    ? getQuestionIdFromVirtualTableId(table.id)
    : undefined;
}
