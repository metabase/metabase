import type { FieldFilterOperator } from "metabase-lib/v1/operators/constants";
import {
  FIELD_FILTER_OPERATORS,
  FILTER_OPERATORS_BY_TYPE_ORDERED,
} from "metabase-lib/v1/operators/constants";

export function doesOperatorExist(
  operatorName?: string,
): operatorName is string {
  return operatorName != null && Boolean(FIELD_FILTER_OPERATORS[operatorName]);
}

export function getOperatorByTypeAndName(
  type: string | undefined,
  name: string,
) {
  const operatorsForType = type
    ? FILTER_OPERATORS_BY_TYPE_ORDERED[type]
    : undefined;
  const typedNamedOperator = operatorsForType?.find(
    (operator) => operator.name === name,
  );
  const namedOperator = FIELD_FILTER_OPERATORS[name];

  return (
    typedNamedOperator && {
      ...typedNamedOperator,
      ...namedOperator,
      numFields: namedOperator.validArgumentsFilters.length,
    }
  );
}

export function isEqualsOperator(operator?: { name?: string } | null): boolean {
  return operator?.name === "=";
}

export function isFuzzyOperator(operator?: { name?: string } | null): boolean {
  const { name } = operator || {};
  return name !== "=" && name !== "!=";
}

export function getFilterArgumentFormatOptions(
  filterOperator: FieldFilterOperator | null | undefined,
  index: number,
): Record<string, unknown> {
  return (
    (filterOperator &&
      filterOperator.formatOptions &&
      filterOperator.formatOptions[index]) ||
    {}
  );
}
