import _ from "underscore";
import LegacyFilter from "../queries/structured/Filter";
import { externalOp } from "../common";
import { filterableColumns, filterableColumnOperators } from "../filter";
import { displayInfo } from "../metadata";
import type {
  ColumnMetadata,
  ColumnWithOperators,
  FilterClause,
  Query,
} from "../types";

// We'll need to pass it everywhere, just hardcoding to last stage for simplicity
const stageIndex = -1;

function findFilterableColumn(query: Query, column: ColumnMetadata) {
  const columnName = displayInfo(query, stageIndex, column).longDisplayName;
  return filterableColumns(query, stageIndex).find(col => {
    const info = displayInfo(query, stageIndex, col);
    return info.longDisplayName === columnName;
  });
}

export function compareFilters(f1: LegacyFilter, f2: LegacyFilter) {
  const operator1 = f1.operator()?.name;
  const operator2 = f2.operator()?.name;

  const dimension1 = f1.dimension()?.getMLv1CompatibleDimension?.();
  const dimension2 = f2.dimension()?.getMLv1CompatibleDimension?.();
  const isSameDimension = dimension1?.isSameBaseDimension?.(dimension2);

  const args1 = f1.arguments().raw?.() || [];
  const args2 = f2.arguments().raw?.() || [];

  return operator1 === operator2 && isSameDimension && _.isEqual(args1, args2);
}

// This won't be needed once externalOp returns `operator` as an opaque object
export function findOperator(
  query: Query,
  column: ColumnMetadata | ColumnWithOperators,
  shortName: string,
) {
  // This won't be needed once externalOp columns are of `ColumnWithOperators` type
  const columnWithOperators = findFilterableColumn(query, column);
  if (!columnWithOperators) {
    return null;
  }

  const operators = filterableColumnOperators(columnWithOperators);
  const operator = operators.find(operator => {
    const info = displayInfo(query, stageIndex, operator);
    return info.shortName === shortName;
  });
  return operator || null;
}

export function fixExternalOp(query: Query, filter: FilterClause) {
  const {
    operator: operatorName,
    options,
    args: [column, ...args],
  } = externalOp(filter);

  const operator = findOperator(query, column, operatorName);

  // This won't be needed once externalOp columns are of `ColumnWithOperators` type
  const columnWithOperators = findFilterableColumn(query, column) || null;

  return {
    operator,
    options,
    args: [columnWithOperators, ...args],
  };
}
