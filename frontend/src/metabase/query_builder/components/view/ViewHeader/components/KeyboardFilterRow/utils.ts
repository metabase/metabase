import { t } from "ttag";

import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { dayjs } from "metabase/dayjs";
import {
  SHORTCUT_OPTION_GROUPS,
  TYPE_OPTIONS,
} from "metabase/querying/common/components/DatePicker/DateShortcutPicker/constants";
import { getCountryName } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/countries";
import { getStateName } from "metabase/querying/common/components/FieldValuePicker/ListValuePicker/states";
import type {
  DatePickerValue,
  RelativeDatePickerValue,
} from "metabase/querying/common/types";
import { getFilterClause as getBooleanFilterClause } from "metabase/querying/filters/components/FilterPicker/BooleanFilterPicker/utils";
import { OPERATORS as COORDINATE_OPERATORS } from "metabase/querying/filters/components/FilterPicker/CoordinateFilterPicker/constants";
import {
  getFilterClause as getCoordinateFilterClause,
  getAvailableOptions as getCoordinateOperatorOptions,
} from "metabase/querying/filters/components/FilterPicker/CoordinateFilterPicker/utils";
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
import {
  getDateFilterClause,
  getDateFilterDisplayName,
  getDatePickerValue,
} from "metabase/querying/filters/utils/dates";
import { formatNumber } from "metabase/utils/formatting";
import { parseNumber } from "metabase/utils/number";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import type {
  ColumnKind,
  DraftColumn,
  DraftOperator,
  DraftState,
  ValueKind,
} from "./types";

export const STAGE_INDEX = -1;

export type ColumnGroup = {
  label: string;
  icon: IconName;
  columns: DraftColumn[];
  segments: Lib.SegmentMetadata[];
};

export function getColumnGroups(
  query: Lib.Query,
  stageIndex: number,
): ColumnGroup[] {
  const columns = Lib.filterableColumns(query, stageIndex);
  return Lib.groupColumns(columns).map((group) => {
    const groupInfo = Lib.displayInfo(query, stageIndex, group);
    return {
      label: groupInfo.displayName,
      icon: getColumnGroupIcon(groupInfo),
      columns: Lib.getColumnsFromColumnGroup(group).map((column) =>
        getDraftColumn(query, stageIndex, column),
      ),
      segments: groupInfo.isSourceTable
        ? Lib.availableSegments(query, stageIndex)
        : [],
    };
  });
}

export function getDraftColumn(
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
  if (Lib.isTime(column)) {
    return "other";
  }
  if (Lib.isDateOrDateTime(column)) {
    return "date";
  }
  if (Lib.isNumeric(column)) {
    return "number";
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

/**
 * Prototype: a boolean column has few values, so the values are the operators.
 * The user picks "true", "false", "empty" or "not empty", and the filter is
 * complete.
 */
function getBooleanOperators(column: Lib.ColumnMetadata): DraftOperator[] {
  const getOperator = (
    key: "true" | "false" | "is-null" | "not-null",
    label: string,
    isValue = false,
  ): DraftOperator => ({
    key,
    label,
    pillValueLabel: isValue ? label : undefined,
    group: isValue ? 0 : 1,
    valueKind: "none",
    isNumeric: false,
    getFilterClause: () => getBooleanFilterClause(column, key),
  });
  return [
    getOperator("true", t`true`, true),
    getOperator("false", t`false`, true),
    getOperator("is-null", t`empty`),
    getOperator("not-null", t`not empty`),
  ];
}

/**
 * Prototype: the operators of a date column are the shortcuts of the date
 * picker, like "previous 30 days", and the pickers for the other filters, like
 * "Fixed date range…". A shortcut is a complete filter. A picker opens in the
 * pill, and its value is the `DatePickerValue` as JSON.
 */
function getDateOperators(column: Lib.ColumnMetadata): DraftOperator[] {
  const shortcutOperators = SHORTCUT_OPTION_GROUPS.flatMap((options, group) =>
    options.map((option): DraftOperator => {
      const label = option.label.toLowerCase();
      return {
        key: option.shortcut,
        label,
        pillValueLabel: label,
        hasNoPillOperator: true,
        group,
        valueKind: "none",
        isNumeric: false,
        getFilterClause: () => getDateFilterClause(column, option.value),
      };
    }),
  );
  const getPickerOperator = (
    operator: Pick<
      DraftOperator,
      "key" | "label" | "datePickerType" | "specificDateOperator"
    >,
  ): DraftOperator => ({
    ...operator,
    hasNoPillOperator: true,
    group: SHORTCUT_OPTION_GROUPS.length,
    valueKind: "date-picker",
    isNumeric: false,
    formatValue: (json) => {
      const value = parseDatePickerValue(json);
      return value != null ? formatDatePickerValue(value) : null;
    },
    getFilterClause: ([json]) => {
      const value = parseDatePickerValue(json);
      return value != null && isDateOperatorValue(operator, value)
        ? getDateFilterClause(column, value)
        : undefined;
    },
  });
  // "Fixed date range…" has these operators too, but users look for them by
  // name.
  const specificOperators = [
    getPickerOperator({
      key: "before",
      label: t`Before…`,
      datePickerType: "specific",
      specificDateOperator: "<",
    }),
    getPickerOperator({
      key: "after",
      label: t`After…`,
      datePickerType: "specific",
      specificDateOperator: ">",
    }),
  ];
  const pickerOperators = TYPE_OPTIONS.map(({ type, label }) =>
    getPickerOperator({
      key: type,
      label,
      datePickerType:
        type === "specific" || type === "relative" ? type : "exclude",
    }),
  );
  return [...shortcutOperators, ...specificOperators, ...pickerOperators];
}

/** True when the operator of a date picker can make the filter of `value`. */
function isDateOperatorValue(
  operator: Pick<DraftOperator, "key" | "specificDateOperator">,
  value: DatePickerValue,
) {
  return operator.specificDateOperator != null
    ? value.type === "specific" &&
        value.operator === operator.specificDateOperator
    : value.type === operator.key;
}

/** The operator of the pill for a date picker value. */
function getDatePickerOperatorKey(value: DatePickerValue) {
  if (value.type === "specific" && value.operator === "<") {
    return "before";
  }
  if (value.type === "specific" && value.operator === ">") {
    return "after";
  }
  return value.type;
}

const LOCAL_DATE_TIME_FORMAT = "YYYY-MM-DDTHH:mm:ss";

/**
 * The value of a date picker as a draft value. The dates of a specific date
 * filter are local dates, so they are stored as local date-times: JSON would
 * store them in UTC, and a date before UTC midnight would become the day
 * before.
 */
export function stringifyDatePickerValue(value: DatePickerValue) {
  return JSON.stringify(
    value.type === "specific"
      ? {
          ...value,
          values: value.values.map((date) =>
            dayjs(date).format(LOCAL_DATE_TIME_FORMAT),
          ),
        }
      : value,
  );
}

export function parseDatePickerValue(
  json: string | undefined,
): DatePickerValue | undefined {
  if (json == null) {
    return undefined;
  }
  try {
    const value: DatePickerValue = JSON.parse(json);
    return value.type === "specific"
      ? {
          ...value,
          values: value.values.map((date) => dayjs(date).toDate()),
        }
      : value;
  } catch {
    return undefined;
  }
}

/**
 * The value of a date filter in the pill, in lower case after the column, like
 * "before Jan 20". A range starts with a date, so it keeps its case.
 */
function formatDatePickerValue(value: DatePickerValue) {
  const text = getDateFilterDisplayName(value, { withPrefix: true });
  return value.type === "specific" && value.operator === "between"
    ? text
    : text.charAt(0).toLowerCase() + text.slice(1);
}

/** The shortcut of the date picker that makes the same filter, if any. */
function getDateShortcutKey(value: RelativeDatePickerValue) {
  const option = SHORTCUT_OPTION_GROUPS.flat().find(
    (option) =>
      option.value.value === value.value &&
      option.value.unit === value.unit &&
      value.offsetValue == null &&
      !value.options?.includeCurrent,
  );
  return option?.shortcut;
}

/** The date column of a date filter that the date picker can edit. */
function getDateFilterColumn(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
) {
  return (
    Lib.specificDateFilterParts(query, stageIndex, filter)?.column ??
    Lib.relativeDateFilterParts(query, stageIndex, filter)?.column ??
    Lib.excludeDateFilterParts(query, stageIndex, filter)?.column
  );
}

function getOperators(column: Lib.ColumnMetadata): DraftOperator[] | undefined {
  if (Lib.isBoolean(column)) {
    return getBooleanOperators(column);
  }

  if (Lib.isTime(column)) {
    return undefined;
  }

  if (Lib.isDateOrDateTime(column)) {
    return getDateOperators(column);
  }

  if (Lib.isNumeric(column)) {
    if (Lib.isCoordinate(column)) {
      return arrangeOperators(getCoordinateOperators(column), NUMBER_LAYOUT);
    }
    const numberOperators = getNumberOperatorOptions(column).map(
      ({ operator, displayName }): DraftOperator => ({
        key: operator,
        label: displayName,
        valueKind: getNumberValueKind(operator),
        isNumeric: true,
        numberOperator: operator,
        getFilterClause: (values) => {
          const numbers = values.map(parseNumber);
          return numbers.every((value) => value != null)
            ? getNumberFilterClause(operator, column, numbers)
            : undefined;
        },
      }),
    );
    return arrangeOperators(numberOperators, NUMBER_LAYOUT);
  }

  if (Lib.isStringOrStringLike(column)) {
    const stringOperators = getStringOperatorOptions(column).map(
      ({ operator, displayName }): DraftOperator => ({
        key: operator,
        label: displayName,
        valueKind:
          STRING_OPERATORS[operator].type === "empty" ? "none" : "multi",
        isNumeric: false,
        hasNoValueSuggestions: STRING_OPERATORS[operator].type === "partial",
        formatValue: Lib.isCountry(column)
          ? getCountryName
          : Lib.isState(column)
            ? getStateName
            : undefined,
        getFilterClause: (values) =>
          getStringFilterClause(operator, column, values, {}),
      }),
    );
    return arrangeOperators(stringOperators, STRING_LAYOUT);
  }

  return undefined;
}

/**
 * Prototype: the order of the operators in the list, in groups that a divider
 * splits, and the short labels of the design, like "empty".
 */
type OperatorLayout = { key: string; label?: () => string }[][];

const STRING_LAYOUT: OperatorLayout = [
  [{ key: "=" }, { key: "!=" }],
  [{ key: "contains" }, { key: "does-not-contain" }],
  [{ key: "starts-with" }, { key: "ends-with" }],
  [
    { key: "is-empty", label: () => t`empty` },
    { key: "not-empty", label: () => t`not empty` },
  ],
];

const NUMBER_LAYOUT: OperatorLayout = [
  [{ key: "between" }],
  [{ key: "=" }, { key: "!=" }],
  [{ key: ">" }, { key: ">=" }, { key: "<" }, { key: "<=" }],
  [
    { key: "is-null", label: () => t`empty` },
    { key: "not-null", label: () => t`not empty` },
  ],
];

/**
 * The operators in the order of the layout, with their groups and lower-case
 * labels. Operators that the layout does not list go last, in a group of their
 * own.
 */
function arrangeOperators(
  operators: DraftOperator[],
  layout: OperatorLayout,
): DraftOperator[] {
  const byKey = new Map(operators.map((operator) => [operator.key, operator]));
  const arranged = layout.flatMap((items, group) =>
    items.flatMap(({ key, label }) => {
      const operator = byKey.get(key);
      return operator != null
        ? [
            {
              ...operator,
              label: label?.() ?? operator.label.toLowerCase(),
              group,
            },
          ]
        : [];
    }),
  );
  const listedKeys = new Set(layout.flat().map(({ key }) => key));
  const rest = operators
    .filter(({ key }) => !listedKeys.has(key))
    .map((operator) => ({ ...operator, group: layout.length }));
  return [...arranged, ...rest];
}

// Prototype: "inside" needs a second column, latitude and longitude, so only
// the popover filter picker offers it.
function getCoordinateOperators(column: Lib.ColumnMetadata): DraftOperator[] {
  return getCoordinateOperatorOptions()
    .filter(({ operator }) => operator !== "inside")
    .map(({ operator, displayName }) => {
      const { valueCount, hasMultipleValues } = COORDINATE_OPERATORS[operator];
      return {
        key: operator,
        label: displayName,
        valueKind:
          valueCount === 2 ? "range" : hasMultipleValues ? "multi" : "single",
        isNumeric: true,
        numberOperator: operator === "inside" ? undefined : operator,
        getFilterClause: (values) => {
          const numbers = values.map(parseNumber);
          return numbers.every((value) => value != null)
            ? getCoordinateFilterClause(operator, column, undefined, numbers)
            : undefined;
        },
      };
    });
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

const OPERATOR_ALIASES: Partial<Record<string, string[]>> = {
  "=": ["=", "==", "==="],
  "!=": ["!=", "!==", "≠"],
  ">": [">"],
  "<": ["<"],
  ">=": [">=", "=>", "≥"],
  "<=": ["<=", "=<", "≤"],
  between: [".."],
};

/** The math symbol of a number operator, shown next to it in the list. */
const OPERATOR_HINTS: Partial<Record<string, string>> = {
  between: "..",
  "=": "=",
  "!=": "!=",
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
};

export function getOperatorHint(operator: DraftOperator) {
  return operator.isNumeric ? OPERATOR_HINTS[operator.key] : undefined;
}

/** Symbols that find an operator in the operator search, like "!=". */
export function getOperatorAliases(operator: DraftOperator) {
  return OPERATOR_ALIASES[operator.key];
}

/**
 * The item whose name is the typed text, ignoring case, for a space after the
 * text to pick it. No item is found while another name continues the text
 * with another word: "is" finds nothing when "is not" exists, so that "is
 * not" can still be typed.
 */
export function findItemByTypedName<T>(
  items: T[],
  getNames: (item: T) => string[],
  typedText: string,
): T | undefined {
  const name = typedText.trim().toLowerCase();
  if (name.length === 0) {
    return undefined;
  }
  const lowerNames = items.map((item) =>
    getNames(item).map((itemName) => itemName.toLowerCase()),
  );
  const isContinued = lowerNames.some((names) =>
    names.some((itemName) => itemName.startsWith(`${name} `)),
  );
  if (isContinued) {
    return undefined;
  }
  const index = lowerNames.findIndex((names) => names.includes(name));
  return index === -1 ? undefined : items[index];
}

/** The names that a space after them selects an operator by. */
export function getOperatorNames(operator: DraftOperator): string[] {
  return [
    // "after" and a space picks "After…".
    operator.label.replace(/…$/, ""),
    ...(operator.isNumeric ? (getOperatorAliases(operator) ?? []) : []),
  ];
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
    case "date-picker":
      return 1;
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
      : operator.valueKind === "date-picker"
        ? valueCount === 1
        : operator.valueKind === "none"
          ? valueCount === 0
          : valueCount > 0;
  return isComplete ? operator.getFilterClause(values) : undefined;
}

export function isValidValue(operator: DraftOperator, value: string) {
  if (operator.valueKind === "date-picker") {
    const dateValue = parseDatePickerValue(value);
    return dateValue != null && isDateOperatorValue(operator, dateValue);
  }
  if (operator.options != null) {
    return operator.options.some((option) => option.value === value);
  }
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
  const dateColumn = getDateFilterColumn(query, stageIndex, filter);
  const dateValue = getDatePickerValue(query, stageIndex, filter);
  if (dateColumn != null && dateValue != null) {
    const shortcutKey =
      dateValue.type === "relative" ? getDateShortcutKey(dateValue) : undefined;
    return shortcutKey != null
      ? getDraftState(query, stageIndex, dateColumn, shortcutKey, [])
      : getDraftState(
          query,
          stageIndex,
          dateColumn,
          getDatePickerOperatorKey(dateValue),
          [stringifyDatePickerValue(dateValue)],
        );
  }

  const coordinateParts = Lib.coordinateFilterParts(query, stageIndex, filter);
  if (coordinateParts != null) {
    return coordinateParts.longitudeColumn == null
      ? getDraftState(
          query,
          stageIndex,
          coordinateParts.column,
          coordinateParts.operator,
          coordinateParts.values.map(String),
        )
      : undefined;
  }

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

  // "Is Bot = true" is the operator "true" with no values.
  const booleanParts = Lib.booleanFilterParts(query, stageIndex, filter);
  if (booleanParts != null) {
    const [value] = booleanParts.values;
    return getDraftState(
      query,
      stageIndex,
      booleanParts.column,
      booleanParts.operator === "=" ? String(value) : booleanParts.operator,
      [],
    );
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
  const option = operator.options?.find((option) => option.value === value);
  if (option != null) {
    return option.label;
  }
  const label = operator.formatValue?.(value);
  if (label != null) {
    return label;
  }
  const number = operator.isNumeric ? parseNumber(value) : null;
  return number != null ? formatNumber(number) : value;
}

/** The operator as the pill shows it in a sentence, like "is between". */
/** Prototype: the math symbol of a number operator, shown in the pill. */
const PILL_OPERATOR_SYMBOLS: Partial<Record<string, string>> = {
  "=": "=",
  "!=": "≠",
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
};

export function getPillOperatorLabel(operator: DraftOperator) {
  if (operator.hasNoPillOperator) {
    return "";
  }
  const symbol = operator.isNumeric
    ? PILL_OPERATOR_SYMBOLS[operator.key]
    : undefined;
  if (symbol != null) {
    return symbol;
  }
  if (operator.pillValueLabel != null) {
    return t`is`;
  }
  const label = operator.label.toLowerCase();
  if (label === "not empty") {
    return t`is not empty`;
  }
  return /^(is|contains|does|starts|ends)\b/.test(label)
    ? label
    : t`is ${label}`;
}
