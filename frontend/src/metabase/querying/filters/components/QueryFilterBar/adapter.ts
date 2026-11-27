import { match } from "ts-pattern";
import _ from "underscore";

import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { getColumnIcon } from "metabase/common/utils/columns";
import type {
  FilterBarAdapter,
  FilterColumn,
  FilterParts,
  PillContent,
} from "metabase/filter-bar";
import * as Lib from "metabase-lib";

import { getFilterColumnGroups } from "../FilterPicker/FilterColumnPicker";

import { findOperator, getOperators, parseValue } from "./operators";
import type { QueryFilter } from "./stages";

const getColumnKey = (
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) =>
  `${Lib.columnKey(column)}:${Lib.displayInfo(query, stageIndex, column).longDisplayName}`;

export const findColumnByKey = (
  query: Lib.Query,
  stageIndex: number,
  key: string,
) =>
  Lib.filterableColumns(query, stageIndex).find(
    (column) => getColumnKey(query, stageIndex, column) === key,
  );

const toFilterColumn = (
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  label: string,
): FilterColumn => ({
  key: getColumnKey(query, stageIndex, column),
  label,
  icon: getColumnIcon(column),
});

const toFilter = (
  query: Lib.Query,
  stageIndex: number,
  { column: { key }, operator, values }: FilterParts,
) => {
  const column = findColumnByKey(query, stageIndex, key);
  const columnOperator = column && findOperator(column, operator.key);
  if (!column || !columnOperator) {
    return null;
  }
  const args = values.map((value) => parseValue(column, String(value)));
  const literals = args.filter((arg) => arg !== null);
  return literals.length === args.length
    ? Lib.expressionClause(
        columnOperator.operator,
        [column, ...literals],
        columnOperator.options,
      )
    : null;
};

const toParts = (
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause | Lib.ExpressionClause,
): FilterParts | null => {
  const parts = Lib.expressionParts(query, stageIndex, filter);
  const [columnArg, ...valueArgs] = parts.args;
  if (!Lib.isColumnMetadata(columnArg)) {
    return null;
  }
  const columns = Lib.filterableColumns(query, stageIndex);
  const column =
    Lib.findMatchingColumn(query, stageIndex, columnArg, columns) ?? columnArg;
  const operator = findOperator(column, parts.operator);
  if (!operator) {
    return null;
  }
  const values = valueArgs.filter((arg) => typeof arg !== "object");
  const hasValueCount = match(operator.valueKind)
    .with("none", () => values.length === 0)
    .with("single", () => values.length === 1)
    .with("range", () => values.length === 2)
    .with("multi", () => values.length > 0)
    .exhaustive();
  const isSimple =
    values.length === valueArgs.length &&
    hasValueCount &&
    _.isEqual(parts.options, operator.options);
  const { longDisplayName } = Lib.displayInfo(query, stageIndex, column);
  return isSimple
    ? {
        column: toFilterColumn(query, stageIndex, column, longDisplayName),
        operator,
        values: values.map(String),
      }
    : null;
};

const toPill = (
  query: Lib.Query,
  stageIndex: number,
  filter: QueryFilter,
): PillContent => {
  if (Lib.isSegmentMetadata(filter)) {
    const { displayName } = Lib.displayInfo(query, stageIndex, filter);
    return { type: "opaque", displayName, icon: "segment" };
  }
  const parts = toParts(query, stageIndex, filter);
  const { displayName } = Lib.displayInfo(query, stageIndex, filter);
  return parts
    ? { type: "parts", parts }
    : { type: "opaque", displayName, icon: "filter" };
};

export const createQueryAdapter = (
  query: Lib.Query,
): FilterBarAdapter<QueryFilter> => ({
  stage: (stageIndex) => ({
    columnGroups: () =>
      getFilterColumnGroups(
        query,
        Lib.stageIndexes(query).filter((index) => index >= stageIndex),
      ).map(({ name, groupInfo, stageIndex, segmentItems, columnItems }) => ({
        label: name,
        icon: getColumnGroupIcon(groupInfo),
        sections: [
          {
            items: segmentItems.map(({ segment, displayName }) => ({
              type: "filter",
              filter: segment,
              label: displayName,
              icon: "segment",
            })),
          },
          {
            items: columnItems.map(({ column, displayName }) => ({
              type: "column",
              column: toFilterColumn(query, stageIndex, column, displayName),
              targetStage: stageIndex,
            })),
          },
        ],
      })),
    operators: ({ key }) => {
      const column = findColumnByKey(query, stageIndex, key);
      return column ? getOperators(column) : null;
    },
    toFilter: (parts) => toFilter(query, stageIndex, parts),
    toPill: (filter) => toPill(query, stageIndex, filter),
    formatValues: ({ values }) => values.map(String).join(", "),
  }),
});
