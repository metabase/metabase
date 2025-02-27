import type { Query } from "history";

import {
  deserializeBooleanParameterValue,
  deserializeStringParameterValue,
  normalizeNumberParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import * as Lib from "metabase-lib";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";
import { getIsMultiSelect } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Parameter,
  ParameterId,
  ParameterValue,
  ParameterValueOrArray,
} from "metabase-types/api";

export function getParameterValueFromQueryParams(
  parameter: Parameter,
  queryParams: Query,
  lastUsedParametersValues?: Record<ParameterId, unknown>,
) {
  queryParams = queryParams || {};
  lastUsedParametersValues = lastUsedParametersValues || {};

  const maybeParameterValue = queryParams[parameter.slug || parameter.id];

  // don't use the default with "param=" because it indicates an unset/cleared parameter value
  if (maybeParameterValue === "") {
    return null;
  } else if (maybeParameterValue == null) {
    // first try to use last used parameter value then try to use the default if
    // the parameter is not present in the query params
    return lastUsedParametersValues[parameter.id] ?? parameter.default ?? null;
  }

  const parsedValue = parseParameterValue(maybeParameterValue, parameter);
  return normalizeParameterValueForWidget(parsedValue, parameter);
}

export function parseParameterValue(value: any, parameter: Parameter) {
  const type = getParameterType(parameter);
  if (type === "temporal-unit") {
    const availableUnits = Lib.availableTemporalUnits();
    return availableUnits.some(unit => unit === value) ? value : null;
  }

  const coercedValue =
    Array.isArray(value) && !getIsMultiSelect(parameter) ? [value[0]] : value;

  // TODO this casting should be removed as we tidy up Parameter types
  const { fields } = parameter as FieldFilterUiParameter;
  if (Array.isArray(fields) && fields.length > 0) {
    return parseParameterValueForFields(coercedValue, fields);
  }

  if (type === "number") {
    return parseParameterValueForNumber(coercedValue);
  }

  return coercedValue;
}

function parseParameterValueForNumber(value: ParameterValueOrArray) {
  // HACK to support multiple values for SQL parameters
  // https://github.com/metabase/metabase/issues/25374#issuecomment-1272520560
  if (typeof value === "string") {
    // something like "1,2,3",  "1, 2,  3", ",,,1,2, 3"
    const splitValues = value.split(",").filter(item => item.trim() !== "");
    if (splitValues.length === 0) {
      return null;
    }

    if (splitValues.length > 1) {
      const numbers = splitValues.map(number => parseFloat(number));
      if (numbers.every(number => !isNaN(number))) {
        return numbers.join(",");
      }

      return null;
    }
  }

  return normalizeNumberParameterValue(value);
}

function parseParameterValueForFields(
  value: ParameterValueOrArray,
  fields: Field[],
): ParameterValueOrArray {
  // unix dates fields are numeric but query params shouldn't be parsed as numbers
  if (fields.every(f => f.isNumeric() && !f.isDate())) {
    return normalizeNumberParameterValue(value);
  }

  if (fields.every(f => f.isBoolean())) {
    return deserializeBooleanParameterValue(value);
  }

  if (fields.every(f => f.isString() || f.isStringLike())) {
    return deserializeStringParameterValue(value);
  }

  return value;
}

function normalizeParameterValueForWidget(
  value: ParameterValue,
  parameter: Parameter,
) {
  const fieldType = getParameterType(parameter);
  if (
    value != null &&
    fieldType !== "date" &&
    fieldType !== "temporal-unit" &&
    !Array.isArray(value)
  ) {
    return [value];
  }

  return value;
}

export function getParameterValuesByIdFromQueryParams(
  parameters: Parameter[],
  queryParams: Query,
  lastUsedParametersValues?: Record<ParameterId, unknown>,
) {
  return Object.fromEntries(
    parameters.map(parameter => [
      parameter.id,
      getParameterValueFromQueryParams(
        parameter,
        queryParams,
        lastUsedParametersValues,
      ),
    ]),
  );
}
