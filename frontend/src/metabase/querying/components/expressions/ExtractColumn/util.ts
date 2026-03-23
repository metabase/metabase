import * as Lib from "metabase-lib";

function getNextName(names: string[], name: string, index: number): string {
  const suffixed = index === 0 ? name : `${name} (${index})`;
  if (!names.includes(suffixed)) {
    return suffixed;
  }
  return getNextName(names, name, index + 1);
}

export function getName(
  query: Lib.Query,
  stageIndex: number,
  info: Lib.ColumnExtractionInfo,
) {
  const columnNames = Lib.returnedColumns(query, stageIndex).map(
    (column) => Lib.displayInfo(query, stageIndex, column).displayName,
  );

  return getNextName(columnNames, info.displayName, 0);
}

export function hasExtractions(
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
) {
  return columns.some(
    (column) => Lib.columnExtractions(query, column).length > 0,
  );
}
