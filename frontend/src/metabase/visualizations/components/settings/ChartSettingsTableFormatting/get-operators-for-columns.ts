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

const COMMON_OPERATOR_NAMES = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "is-null": t`is null`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "not-null": t`is not null`,
};

const NUMBER_OPERATOR_NAMES = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "=": t`is equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "!=": t`is not equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "<": t`is less than`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ">": t`is greater than`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "<=": t`is less than or equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  ">=": t`is greater than or equal to`,
};

const STRING_OPERATOR_NAMES = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "=": t`is equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "!=": t`is not equal to`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  contains: t`contains`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "does-not-contain": t`does not contain`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "starts-with": t`starts with`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "ends-with": t`ends with`,
};

const BOOLEAN_OPERATOR_NAMES = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "is-true": t`is true`,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  "is-false": t`is false`,
};

const not =
  (...fns: ((field: DatasetColumn) => boolean)[]) =>
  (field: DatasetColumn) =>
    !fns.some((fn) => fn(field));

const or =
  (...fns: ((field: DatasetColumn) => boolean)[]) =>
  (field: DatasetColumn) =>
    fns.some((fn) => fn(field));

export const ALL_OPERATOR_NAMES: Record<ColumnFormattingOperator, string> = {
  ...NUMBER_OPERATOR_NAMES,
  ...STRING_OPERATOR_NAMES,
  ...BOOLEAN_OPERATOR_NAMES,
  ...COMMON_OPERATOR_NAMES,
};

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
      operators: { ...COMMON_OPERATOR_NAMES, ...BOOLEAN_OPERATOR_NAMES },
      isFieldDisabled: not(isBoolean),
    };
  }

  // primary or foreign keys
  if (columns.every(isPK) || columns.every(isFK)) {
    return {
      ...defaultResult,
      isKeyRule: true,
      isStringRule: true,
      operators: { ...COMMON_OPERATOR_NAMES, ...STRING_OPERATOR_NAMES },
      isFieldDisabled: not(isPK, isFK),
    };
  }

  // all strings
  if (columns.every((column) => isString(column) || isBoolean(column))) {
    return {
      ...defaultResult,
      isStringRule: true,
      operators: { ...COMMON_OPERATOR_NAMES, ...STRING_OPERATOR_NAMES },
      isFieldDisabled: or(not(isString), isBoolean),
    };
  }

  // all numbers
  if (columns.every(isNumeric)) {
    return {
      ...defaultResult,
      isNumericRule: true,
      operators: { ...COMMON_OPERATOR_NAMES, ...NUMBER_OPERATOR_NAMES },
      isFieldDisabled: or(not(isNumeric), isPK, isFK),
    };
  }

  return defaultResult;
}
