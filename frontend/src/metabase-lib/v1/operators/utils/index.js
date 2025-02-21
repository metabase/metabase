import _ from "underscore";

import {
  AGGREGATION_OPERATORS,
  FIELD_FILTER_OPERATORS,
  FILTER_OPERATORS_BY_TYPE_ORDERED,
} from "metabase-lib/v1/operators/constants";

export function doesOperatorExist(operatorName) {
  return !!FIELD_FILTER_OPERATORS[operatorName];
}

export function getOperatorByTypeAndName(type, name) {
  const typedNamedOperator = _.findWhere(
    FILTER_OPERATORS_BY_TYPE_ORDERED[type],
    {
      name,
    },
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

export function getSupportedAggregationOperators(database) {
  return AGGREGATION_OPERATORS.filter(operator => {
    if (!operator.requiredDriverFeature) {
      return true;
    }
    return database?.features.includes(operator.requiredDriverFeature);
  });
}

function populateFields(aggregationOperator, fields) {
  return {
    ...aggregationOperator,
    fields: aggregationOperator.validFieldsFilters.map(validFieldsFilters =>
      validFieldsFilters(fields),
    ),
  };
}

export function getAggregationOperators(database, fields) {
  return getSupportedAggregationOperators(database)
    .map(operator => populateFields(operator, fields))
    .filter(
      aggregation =>
        !aggregation.requiresField ||
        aggregation.fields.every(fields => fields.length > 0),
    );
}

export function isEqualsOperator(operator) {
  return !!operator && operator.name === "=";
}

export function isFuzzyOperator(operator) {
  const { name } = operator || {};
  return !["=", "!="].includes(name);
}

export function getFilterArgumentFormatOptions(filterOperator, index) {
  return (
    (filterOperator &&
      filterOperator.formatOptions &&
      filterOperator.formatOptions[index]) ||
    {}
  );
}
