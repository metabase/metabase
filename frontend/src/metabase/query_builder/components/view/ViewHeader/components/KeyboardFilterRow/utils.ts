import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { getFilterClause as getBooleanFilterClause } from "metabase/querying/filters/components/FilterPicker/BooleanFilterPicker/utils";
import { OPERATORS as NUMBER_OPERATORS } from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/constants";
import {
  getFilterClause as getNumberFilterClause,
  getAvailableOptions as getNumberOperatorOptions,
} from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker/utils";
import { OPERATORS as STRING_OPERATORS } from "metabase/querying/filters/components/FilterPicker/StringFilterPicker/constants";
import {
  getFilterClause as getStringFilterClause,
  getAvailableOptions as getStringOperatorOptions,
} from "metabase/querying/filters/components/FilterPicker/StringFilterPicker/utils";
import { formatNumber } from "metabase/utils/formatting";
import { parseNumber } from "metabase/utils/number";
import * as Lib from "metabase-lib";

import type {
  ColumnKind,
  DraftColumn,
  DraftOperator,
  DraftState,
  SuggestionGroup,
  ValueKind,
} from "./types";

export const STAGE_INDEX = -1;

export type ColumnGroup = {
  label: string;
  columns: DraftColumn[];
};

export function getColumnGroups(
  query: Lib.Query,
  stageIndex: number,
): ColumnGroup[] {
  const columns = Lib.filterableColumns(query, stageIndex);
  return Lib.groupColumns(columns).map((group) => ({
    label: Lib.displayInfo(query, stageIndex, group).displayName,
    columns: Lib.getColumnsFromColumnGroup(group).map((column) =>
      getDraftColumn(query, stageIndex, column),
    ),
  }));
}

export function getColumnSuggestionGroups(
  groups: ColumnGroup[],
): SuggestionGroup[] {
  return groups.map((group, groupIndex) => ({
    label: group.label,
    options: group.columns.map((column, columnIndex) => ({
      value: getColumnKey(groupIndex, columnIndex),
      label: column.label,
      icon: getColumnIcon(column.column),
    })),
  }));
}

export function getColumnKey(groupIndex: number, columnIndex: number) {
  return `${groupIndex}:${columnIndex}`;
}

function getDraftColumn(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): DraftColumn {
  return {
    column,
    label: Lib.displayInfo(query, stageIndex, column).displayName,
    kind: getColumnKind(column),
    operators: getOperators(column),
  };
}

function getColumnKind(column: Lib.ColumnMetadata): ColumnKind {
  if (Lib.isBoolean(column)) {
    return "boolean";
  }
  if (Lib.isTime(column) || Lib.isDateOrDateTime(column)) {
    return "other";
  }
  if (Lib.isNumeric(column)) {
    return Lib.isCoordinate(column) ? "other" : "number";
  }
  return Lib.isStringOrStringLike(column) ? "string" : "other";
}

/**
 * The draft with a new column. It keeps the operator and the values when they
 * work for a column of the same kind, otherwise only the column is set.
 */
export function changeDraftColumn(
  { column, operator, values }: DraftState,
  newColumn: DraftColumn,
): DraftState {
  const newOperator =
    column?.kind === newColumn.kind
      ? newColumn.operators?.find(({ key }) => key === operator?.key)
      : undefined;
  return newOperator != null &&
    values.every((value) => isValidValue(newOperator, value))
    ? { column: newColumn, operator: newOperator, values }
    : { column: newColumn, values: [] };
}

const BOOLEAN_OPERATORS = [
  { key: "true", label: () => t`is true` },
  { key: "false", label: () => t`is false` },
  { key: "is-null", label: () => t`is empty` },
  { key: "not-null", label: () => t`is not empty` },
] as const;

function getOperators(column: Lib.ColumnMetadata): DraftOperator[] | undefined {
  if (Lib.isBoolean(column)) {
    return BOOLEAN_OPERATORS.map(({ key, label }) => ({
      key,
      label: label(),
      valueKind: "none",
      isNumeric: false,
      getFilterClause: () => getBooleanFilterClause(column, key),
    }));
  }

  if (Lib.isTime(column) || Lib.isDateOrDateTime(column)) {
    return undefined;
  }

  if (Lib.isNumeric(column)) {
    if (Lib.isCoordinate(column)) {
      return undefined;
    }
    return getNumberOperatorOptions(column).map(
      ({ operator, displayName }) => ({
        key: operator,
        label: displayName,
        valueKind: getNumberValueKind(operator),
        isNumeric: true,
        getFilterClause: (values) => {
          const numbers = values.map(parseNumber);
          return numbers.every((value) => value != null)
            ? getNumberFilterClause(operator, column, numbers)
            : undefined;
        },
      }),
    );
  }

  if (Lib.isStringOrStringLike(column)) {
    return getStringOperatorOptions(column).map(
      ({ operator, displayName }) => ({
        key: operator,
        label: displayName,
        valueKind:
          STRING_OPERATORS[operator].type === "empty" ? "none" : "multi",
        isNumeric: false,
        getFilterClause: (values) =>
          getStringFilterClause(operator, column, values, {}),
      }),
    );
  }

  return undefined;
}

function getNumberValueKind(operator: Lib.NumberFilterOperator): ValueKind {
  const { valueCount, hasMultipleValues } = NUMBER_OPERATORS[operator];
  if (valueCount === 0) {
    return "none";
  }
  if (valueCount === 2) {
    return "range";
  }
  return hasMultipleValues ? "multi" : "single";
}

export function getMaxValueCount(valueKind: ValueKind): number {
  switch (valueKind) {
    case "none":
      return 0;
    case "single":
      return 1;
    case "range":
      return 2;
    case "multi":
      return Infinity;
  }
}

export function getDraftFilterClause({
  operator,
  values,
}: DraftState): Lib.ExpressionClause | undefined {
  if (operator == null) {
    return undefined;
  }
  const valueCount = values.length;
  const isComplete =
    operator.valueKind === "range"
      ? valueCount === 2
      : operator.valueKind === "none"
        ? valueCount === 0
        : valueCount > 0;
  return isComplete ? operator.getFilterClause(values) : undefined;
}

export function isValidValue(operator: DraftOperator, value: string) {
  return (
    value.length > 0 && (!operator.isNumeric || parseNumber(value) != null)
  );
}

/**
 * The inline pill state for an existing filter, or undefined when the inline
 * pill cannot edit it.
 */
export function getDraftStateFromFilter(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): DraftState | undefined {
  const numberParts = Lib.numberFilterParts(query, stageIndex, filter);
  if (numberParts != null) {
    return getDraftState(
      query,
      stageIndex,
      numberParts.column,
      numberParts.operator,
      numberParts.values.map(String),
    );
  }

  const stringParts = Lib.stringFilterParts(query, stageIndex, filter);
  if (stringParts != null && !stringParts.options.caseSensitive) {
    return getDraftState(
      query,
      stageIndex,
      stringParts.column,
      stringParts.operator,
      stringParts.values,
    );
  }

  const booleanParts = Lib.booleanFilterParts(query, stageIndex, filter);
  if (booleanParts != null) {
    const key =
      booleanParts.operator === "="
        ? String(booleanParts.values[0] ?? true)
        : booleanParts.operator;
    return getDraftState(query, stageIndex, booleanParts.column, key, []);
  }

  return undefined;
}

function getDraftState(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  operatorKey: string,
  values: string[],
): DraftState | undefined {
  const draftColumn = getDraftColumn(query, stageIndex, column);
  const operator = draftColumn.operators?.find(
    (operator) => operator.key === operatorKey,
  );
  return operator != null
    ? { column: draftColumn, operator, values }
    : undefined;
}

export function formatDraftValue(operator: DraftOperator, value: string) {
  const number = operator.isNumeric ? parseNumber(value) : null;
  return number != null ? formatNumber(number) : value;
}

/** The operator as the pill shows it in a sentence, like "is between". */
export function getPillOperatorLabel(operator: DraftOperator) {
  const label = operator.label.toLowerCase();
  if (label === "not empty") {
    return t`is not empty`;
  }
  return /^(is|contains|does|starts|ends)\b/.test(label)
    ? label
    : t`is ${label}`;
}
