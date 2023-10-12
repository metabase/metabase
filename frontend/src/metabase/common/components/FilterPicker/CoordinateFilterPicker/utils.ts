import * as Lib from "metabase-lib";
import type { CoordinateFilterOperatorName } from "metabase-lib";
import { OPTIONS } from "./constants";

export function findLatitudeColumns(query: Lib.Query, stageIndex: number) {
  const filterableColumns = Lib.filterableColumns(query, stageIndex);
  return filterableColumns.filter(column => Lib.isLatitude(column));
}

export function findLongitudeColumns(query: Lib.Query, stageIndex: number) {
  const filterableColumns = Lib.filterableColumns(query, stageIndex);
  return filterableColumns.filter(column => Lib.isLongitude(column));
}

/**
 * For "inside" filters, we may start with just one column, and need to find a second column
 */
export const findSecondColumn = ({
  query,
  stageIndex,
  column,
  filter,
  operatorName,
}: {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  operatorName: CoordinateFilterOperatorName;
}): Lib.ColumnMetadata | null => {
  if (operatorName !== "inside") {
    return null;
  }

  if (filter) {
    const filterParts = Lib.coordinateFilterParts(query, stageIndex, filter);
    if (filterParts?.longitudeColumn) {
      return filterParts.longitudeColumn;
    }
  }

  if (Lib.isLatitude(column)) {
    return findLongitudeColumns(query, stageIndex)[0] ?? null;
  }

  if (Lib.isLongitude(column)) {
    return findLatitudeColumns(query, stageIndex)[0] ?? null;
  }

  return null;
};

export const getColumnOptions = ({
  query,
  stageIndex,
  columns,
}: {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
}) => {
  return columns.map(column => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);

    return {
      label: columnInfo.displayName,
      value: getColumnIdentifier(query, stageIndex, column),
      column,
    };
  });
};

export const getColumnIdentifier = (
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata | null,
) => {
  if (!column) {
    return "";
  }
  const columnInfo = Lib.displayInfo(query, stageIndex, column);

  return `${columnInfo?.table?.name ?? "computed"}_${columnInfo.name}`;
};

export function isFilterValid(
  operatorName: CoordinateFilterOperatorName,
  values: number[],
) {
  const option = OPTIONS.find(option => option.operator === operatorName);
  if (!option) {
    return false;
  }

  const { valueCount } = option;
  const filledValues = values.filter(
    value => typeof value === "number" && Number.isFinite(value),
  );

  return Number.isFinite(valueCount)
    ? filledValues.length === valueCount
    : filledValues.length >= 1;
}
