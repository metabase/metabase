import type {
  FieldFilterOperator,
  FilterArgumentFormatOptions,
  FilterOperatorName,
  FilterOperatorType,
  NamedFilterOperator,
} from "metabase-lib/v1/operators/constants";
import {
  FIELD_FILTER_OPERATORS,
  FILTER_OPERATORS_BY_TYPE_ORDERED,
} from "metabase-lib/v1/operators/constants";

type NamedFieldFilterOperator = NamedFilterOperator &
  FieldFilterOperator & {
    numFields: number;
  };

export function doesOperatorExist(
  operatorName?: string,
): operatorName is FilterOperatorName {
  return operatorName != null && operatorName in FIELD_FILTER_OPERATORS;
}

export function getOperatorByTypeAndName(
  type: FilterOperatorType | undefined,
  name: FilterOperatorName,
): NamedFieldFilterOperator | undefined {
  const operatorsForType: NamedFilterOperator[] | undefined = type
    ? FILTER_OPERATORS_BY_TYPE_ORDERED[type]
    : undefined;
  const typedNamedOperator = operatorsForType?.find(
    (operator) => operator.name === name,
  );
  const namedOperator: FieldFilterOperator = FIELD_FILTER_OPERATORS[name];

  return (
    typedNamedOperator && {
      ...typedNamedOperator,
      ...namedOperator,
      numFields: namedOperator.validArgumentsFilters.length,
    }
  );
}

export function isEqualsOperator(
  operator?: NamedFieldFilterOperator | null,
): boolean {
  return operator?.name === "=";
}

export function isFuzzyOperator(
  operator?: NamedFieldFilterOperator | null,
): boolean {
  const { name } = operator || {};
  return name !== "=" && name !== "!=";
}

export function getFilterArgumentFormatOptions(
  filterOperator: FieldFilterOperator | null | undefined,
  index: number,
): FilterArgumentFormatOptions {
  return (
    (filterOperator &&
      filterOperator.formatOptions &&
      filterOperator.formatOptions[index]) ||
    {}
  );
}
