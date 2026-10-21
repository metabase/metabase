import {
  DATA_APP_LOG_ID_COLUMN,
  DEFAULT_SORTING,
  type DataAppLogColumn,
} from "metabase-enterprise/monitor/ai-auditing/data-apps-analytics/query-utils";
import type {
  DatasetColumn,
  DatasetData,
  RowValue,
  SortingOptions,
} from "metabase-types/api";

export type LogRow = { id: string } & Partial<
  Record<DataAppLogColumn, RowValue>
>;

// A sort can outlive its column, e.g. a PII column after retention was turned off.
export function getEffectiveSorting(
  sorting: SortingOptions<DataAppLogColumn>,
  sortableColumns: readonly DataAppLogColumn[],
): SortingOptions<DataAppLogColumn> {
  return sortableColumns.includes(sorting.sort_column)
    ? sorting
    : DEFAULT_SORTING;
}

// Warehouses return column names in upper or lower case, so they're matched case-insensitively.
// A column remapped to a human-readable one (a question's id to its name) reads from that one.
function getColumnIndexByName(
  cols: readonly DatasetColumn[],
): Map<string, number> {
  const indexByName = new Map(
    cols.map((col, index) => [col.name.toLowerCase(), index]),
  );
  return new Map(
    cols.map((col, index) => {
      const remappedIndex =
        col.remapped_to === undefined
          ? undefined
          : indexByName.get(col.remapped_to.toLowerCase());
      return [col.name.toLowerCase(), remappedIndex ?? index];
    }),
  );
}

export function getLogRows(
  { cols, rows }: Pick<DatasetData, "cols" | "rows">,
  columns: readonly DataAppLogColumn[],
  page: number,
): LogRow[] {
  const columnIndex = getColumnIndexByName(cols);
  const idIndex = columnIndex.get(DATA_APP_LOG_ID_COLUMN);
  return rows.map((row, rowIndex) => {
    const values = Object.fromEntries(
      columns.map((column) => {
        const index = columnIndex.get(column);
        return [column, index === undefined ? null : row[index]];
      }),
    );
    const id = idIndex === undefined ? null : row[idIndex];
    return { id: String(id ?? `${page}-${rowIndex}`), ...values };
  });
}
