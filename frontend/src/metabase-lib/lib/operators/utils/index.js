import _ from "underscore";

import { getFieldType, isFieldType } from "metabase-lib/lib/types/utils/isa";
import {
  FOREIGN_KEY,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  UNKNOWN,
} from "metabase-lib/lib/types/constants";
import {
  FIELD_FILTER_OPERATORS,
  FILTER_OPERATORS_BY_TYPE_ORDERED,
  AGGREGATION_OPERATORS,
  MORE_VERBOSE_NAMES,
} from "metabase-lib/lib/operators/constants";

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

export function getFilterOperators(field, table, selected) {
  const fieldType = getFieldType(field) || UNKNOWN;
  let type = fieldType;
  if (type === PRIMARY_KEY || type === FOREIGN_KEY) {
    if (isFieldType(STRING, field)) {
      type = STRING;
    } else if (isFieldType(STRING_LIKE, field)) {
      type = STRING_LIKE;
    }
  }

  return FILTER_OPERATORS_BY_TYPE_ORDERED[type]
    .map(operatorForType => {
      const operator = FIELD_FILTER_OPERATORS[operatorForType.name];
      const verboseNameLower = operatorForType.verboseName.toLowerCase();
      return {
        ...operator,
        ...operatorForType,
        moreVerboseName:
          MORE_VERBOSE_NAMES[verboseNameLower] || verboseNameLower,
        fields: operator.validArgumentsFilters.map(validArgumentsFilter =>
          validArgumentsFilter(field, table),
        ),
      };
    })
    .filter(operator => {
      if (selected === undefined) {
        return true;
      }
      if (type === "STRING" || type === "STRING_LIKE") {
        // Text fields should only have is-null / not-null if it was already selected
        if (selected === "is-null") {
          return operator["name"] !== "not-null";
        } else if (selected === "not-null") {
          return operator["name"] !== "is-null";
        } else {
          return (
            operator["name"] !== "not-null" && operator["name"] !== "is-null"
          );
        }
      }
      return true;
    });
}

export function getSupportedAggregationOperators(table) {
  return AGGREGATION_OPERATORS.filter(operator => {
    if (!operator.requiredDriverFeature) {
      return true;
    }
    return (
      table.db && table.db.features.includes(operator.requiredDriverFeature)
    );
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

export function getAggregationOperators(table) {
  return getSupportedAggregationOperators(table)
    .map(operator => populateFields(operator, table.fields))
    .filter(
      aggregation =>
        !aggregation.requiresField ||
        aggregation.fields.every(fields => fields.length > 0),
    );
}

export function getAggregationOperator(short) {
  return _.findWhere(AGGREGATION_OPERATORS, { short: short });
}

export function isCompatibleAggregationOperatorForField(
  aggregationOperator,
  field,
) {
  return aggregationOperator.validFieldsFilters.every(
    filter => filter([field]).length === 1,
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
