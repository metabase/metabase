import type {
  JevQuestionColumn,
  JevQuestionColumnKind,
} from "metabase/api/jev-filters";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import * as Lib from "metabase-lib";
import type { ParameterValueOrArray } from "metabase-types/api";

import type { JevAppliedFilter, JevPaletteRowSpec } from "./types";

const STAGE_INDEX = -1;
export const MAX_JEV_QUESTION_COLUMNS = 200;

export interface JevQuestionColumnEntry {
  column: Lib.ColumnMetadata;
  info: JevQuestionColumn;
}

export type JevQuestionColumnsByKey = ReadonlyMap<
  string,
  JevQuestionColumnEntry
>;

function getColumnKind(
  column: Lib.ColumnMetadata,
  fieldId: number | null,
): JevQuestionColumnKind | null {
  if (Lib.isTemporal(column)) {
    return "date";
  }
  if (Lib.isPrimaryKey(column) || Lib.isForeignKey(column)) {
    return null;
  }
  if (Lib.isNumeric(column)) {
    return "number";
  }
  const isValueLike =
    Lib.isStringOrStringLike(column) ||
    Lib.isCategory(column) ||
    Lib.isBoolean(column);
  return isValueLike && fieldId != null ? "values" : null;
}

/** The last stage's filterable columns Jev can pick values for, keyed by their index. */
export function getJevQuestionColumns(
  query: Lib.Query,
): JevQuestionColumnsByKey {
  const entries = Lib.filterableColumns(query, STAGE_INDEX).flatMap(
    (column, index): [string, JevQuestionColumnEntry][] => {
      const { fieldId } = Lib.fieldValuesSearchInfo(query, column);
      const kind = getColumnKind(column, fieldId);
      if (kind == null) {
        return [];
      }
      const displayInfo = Lib.displayInfo(query, STAGE_INDEX, column);
      const key = String(index);
      const info: JevQuestionColumn = {
        key,
        field_id: fieldId,
        name: displayInfo.name,
        display_name: displayInfo.longDisplayName,
        kind,
        description: displayInfo.description ?? null,
      };
      return [[key, { column, info }]];
    },
  );
  return new Map(entries.slice(0, MAX_JEV_QUESTION_COLUMNS));
}

function getCurrentFilterLabel(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): string | undefined {
  const { filterPositions = [] } = Lib.displayInfo(query, STAGE_INDEX, column);
  const filters = Lib.filters(query, STAGE_INDEX);
  const labels = filterPositions.flatMap((position) => {
    const filter = filters[position];
    return filter
      ? [Lib.displayInfo(query, STAGE_INDEX, filter).displayName]
      : [];
  });
  return labels.length > 0 ? labels.join(", ") : undefined;
}

export function getJevQuestionRowSpec(
  query: Lib.Query,
  entry: JevQuestionColumnEntry,
  name = entry.info.display_name,
): JevPaletteRowSpec {
  return {
    id: entry.info.key,
    name,
    icon: getColumnIcon(entry.column),
    currentValue: getCurrentFilterLabel(query, entry.column),
  };
}

function toArray(value: ParameterValueOrArray) {
  return Array.isArray(value) ? value : [value];
}

function toNumbers(value: ParameterValueOrArray): number[] {
  return toArray(value).flatMap((item) => {
    const number = typeof item === "string" ? Number(item) : item;
    return typeof number === "number" && Number.isFinite(number)
      ? [number]
      : [];
  });
}

function toBooleans(value: ParameterValueOrArray): boolean[] {
  return toArray(value).flatMap((item) => {
    if (typeof item === "boolean") {
      return [item];
    }
    if (item === "true" || item === "false") {
      return [item === "true"];
    }
    return [];
  });
}

const NUMBER_OPERATORS: Record<string, Lib.NumberFilterOperator> = {
  "number/=": "=",
  "number/!=": "!=",
  "number/>=": ">=",
  "number/<=": "<=",
};

function getNumberBetweenClause(
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | null {
  const [min, max] = toArray(value);
  const [minNumber] = min == null ? [] : toNumbers(min);
  const [maxNumber] = max == null ? [] : toNumbers(max);
  if (minNumber != null && maxNumber != null) {
    return Lib.numberFilterClause({
      operator: "between",
      column,
      values: [minNumber, maxNumber],
    });
  }
  if (minNumber != null) {
    return Lib.numberFilterClause({
      operator: ">=",
      column,
      values: [minNumber],
    });
  }
  if (maxNumber != null) {
    return Lib.numberFilterClause({
      operator: "<=",
      column,
      values: [maxNumber],
    });
  }
  return null;
}

function getNumberFilterClause(
  column: Lib.ColumnMetadata,
  parameterType: string,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | null {
  if (parameterType === "number/between") {
    return getNumberBetweenClause(column, value);
  }
  const operator = NUMBER_OPERATORS[parameterType] ?? "=";
  const numbers = toNumbers(value);
  if (numbers.length === 0) {
    return null;
  }
  // Only "=" and "!=" take several values.
  const values =
    operator === "=" || operator === "!=" ? numbers : numbers.slice(0, 1);
  return Lib.numberFilterClause({ operator, column, values });
}

function getValuesFilterClause(
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | null {
  if (Lib.isBoolean(column)) {
    const [boolean] = toBooleans(value);
    return boolean != null
      ? Lib.booleanFilterClause({ operator: "=", column, values: [boolean] })
      : null;
  }
  const strings = toArray(value).flatMap((item) =>
    item == null ? [] : [String(item)],
  );
  return strings.length > 0
    ? Lib.stringFilterClause({
        operator: "=",
        column,
        values: strings,
        options: {},
      })
    : null;
}

function getDateClause(
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | null {
  const [first] = toArray(value);
  const dateValue = deserializeDateParameterValue(
    typeof first === "string" ? first : null,
  );
  return dateValue ? getDateFilterClause(column, dateValue) : null;
}

export function getJevFilterClause(
  entry: JevQuestionColumnEntry,
  filter: JevAppliedFilter,
): Lib.ExpressionClause | null {
  const { column, info } = entry;
  switch (info.kind) {
    case "date":
      return getDateClause(column, filter.value);
    case "number":
      return getNumberFilterClause(column, filter.parameterType, filter.value);
    case "values":
      return getValuesFilterClause(column, filter.value);
  }
}

export function applyJevFilters(
  query: Lib.Query,
  columnsByKey: JevQuestionColumnsByKey,
  filters: readonly JevAppliedFilter[],
): Lib.Query {
  return filters.reduce((nextQuery, filter) => {
    const entry = columnsByKey.get(filter.suggestion.parameter_id);
    const clause = entry ? getJevFilterClause(entry, filter) : null;
    return clause ? Lib.filter(nextQuery, STAGE_INDEX, clause) : nextQuery;
  }, query);
}
