import type { HighlightedObject } from "metabase/visualizations/types";
import type {
  DatasetColumn,
  DatasetData,
  RowValues,
  Series,
} from "metabase-types/api";

export type HighlightedTableCell = {
  rowIndex: number;
  columnIndex: number;
};

function sourceRowMatchesDimensions(
  sourceRow: RowValues,
  sourceCols: DatasetColumn[],
  dimensions: NonNullable<HighlightedObject["dimensions"]>,
): boolean {
  return dimensions.every(({ columnName, value }) => {
    const columnIndex = sourceCols.findIndex((col) => col.name === columnName);
    if (columnIndex === -1) {
      return false;
    }

    return sourceRow[columnIndex] === value;
  });
}

function getHighlightedColumnName(
  highlighted: HighlightedObject,
  sourceCols: DatasetColumn[],
): string | undefined {
  if (highlighted.columnName) {
    return highlighted.columnName;
  }

  const aggregationColumns = sourceCols.filter(
    (column) => column.source === "aggregation",
  );

  return aggregationColumns.length === 1
    ? aggregationColumns[0].name
    : undefined;
}

export function getHighlightedTableCells(
  series: Series,
  renderedData: DatasetData,
  highlighted: HighlightedObject | null | undefined,
  isPivoted: boolean,
): HighlightedTableCell[] {
  if (!highlighted) {
    return [];
  }

  const [{ card, data: sourceData }] = series;

  if (
    highlighted.cardId != null &&
    card.id != null &&
    highlighted.cardId !== card.id
  ) {
    return [];
  }

  const dimensions = highlighted.dimensions;
  const columnName = getHighlightedColumnName(highlighted, sourceData.cols);
  const { rows, cols, sourceRows } = renderedData;

  if (!dimensions?.length || !columnName || (isPivoted && !sourceRows)) {
    return [];
  }

  const cells: HighlightedTableCell[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (let columnIndex = 0; columnIndex < cols.length; columnIndex++) {
      const column = cols[columnIndex];
      if (column.name !== columnName) {
        continue;
      }

      const sourceRowIndex = isPivoted
        ? sourceRows?.[rowIndex]?.[columnIndex]
        : rowIndex;

      if (sourceRowIndex == null) {
        continue;
      }

      const sourceRow = sourceData.rows[sourceRowIndex];
      if (!sourceRowMatchesDimensions(sourceRow, sourceData.cols, dimensions)) {
        continue;
      }

      cells.push({
        rowIndex,
        columnIndex,
      });
    }
  }

  return cells;
}

export function getHighlightedTableCellKey({
  rowIndex,
  columnIndex,
}: HighlightedTableCell): string {
  return `${rowIndex}:${columnIndex}`;
}
