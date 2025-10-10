import { t } from "ttag";

import {
  isBoolean,
  isFK,
  isNumeric,
  isPK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnFormattingOperator,
  DatasetColumn,
} from "metabase-types/api";

const getCommonOperatorNames = () => ({
  "is-null": t`is null`,
  "not-null": t`is not null`,
});

const getNumberOperatorNames = () => ({
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  "<": t`is less than`,
  ">": t`is greater than`,
  "<=": t`is less than or equal to`,
  ">=": t`is greater than or equal to`,
});

const getStringOperatorNames = () => ({
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  contains: t`contains`,
  "does-not-contain": t`does not contain`,
  "starts-with": t`starts with`,
  "ends-with": t`ends with`,
});

const getBooleanOperatorNames = () => ({
  "is-true": t`is true`,
  "is-false": t`is false`,
});

const not =
  (...fns: ((field: DatasetColumn) => boolean)[]) =>
  (field: DatasetColumn) =>
    !fns.some((fn) => fn(field));

const or =
  (...fns: ((field: DatasetColumn) => boolean)[]) =>
  (field: DatasetColumn) =>
    fns.some((fn) => fn(field));

export const getAllOperatorNames = (): Record<ColumnFormattingOperator, string> => ({
  ...getNumberOperatorNames(),
  ...getStringOperatorNames(),
  ...getBooleanOperatorNames(),
  ...getCommonOperatorNames(),
});

export function getOperatorsForColumns(
  columns: (DatasetColumn | undefined)[],
): {
  isStringRule: boolean;
  isNumericRule: boolean;
  isBooleanRule: boolean;
  isKeyRule: boolean;
  operators: Partial<Record<ColumnFormattingOperator, string>>;
  isFieldDisabled: (_column: DatasetColumn) => boolean;
} {
  const isFieldDisabled = (_column: DatasetColumn) => false;

  const defaultResult = {
    isStringRule: false,
    isNumericRule: false,
    isBooleanRule: false,
    isKeyRule: false,
    operators: {},
    isFieldDisabled,
  };

  if (columns.length === 0) {
    return defaultResult;
  }

  // all booleans
  if (columns.every(isBoolean)) {
    return {
      ...defaultResult,
      isBooleanRule: true,
      operators: { ...getCommonOperatorNames(), ...getBooleanOperatorNames() },
      isFieldDisabled: not(isBoolean),
    };
  }

  // primary or foreign keys
  if (columns.every(isPK) || columns.every(isFK)) {
    return {
      ...defaultResult,
      isKeyRule: true,
      isStringRule: true,
      operators: { ...getCommonOperatorNames(), ...getStringOperatorNames() },
      isFieldDisabled: not(isPK, isFK),
    };
  }

  // all strings
  if (columns.every((column) => isString(column) || isBoolean(column))) {
    return {
      ...defaultResult,
      isStringRule: true,
      operators: { ...getCommonOperatorNames(), ...getStringOperatorNames() },
      isFieldDisabled: or(not(isString), isBoolean),
    };
  }

  // all numbers
  if (columns.every(isNumeric)) {
    return {
      ...defaultResult,
      isNumericRule: true,
      operators: { ...getCommonOperatorNames(), ...getNumberOperatorNames() },
      isFieldDisabled: or(not(isNumeric), isPK, isFK),
    };
  }

  return defaultResult;
}
