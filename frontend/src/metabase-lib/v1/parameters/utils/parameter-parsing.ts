import {
  normalizeBooleanParameterValue,
  normalizeDateParameterValue,
  normalizeNumberParameterValue,
  normalizeStringParameterValue,
  normalizeTemporalUnitParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import * as Lib from "metabase-lib";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";
import { getIsMultiSelect } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Parameter,
  ParameterType,
  ParameterValue,
  ParameterValueOrArray,
  ParameterValuesMap,
} from "metabase-types/api";

export function getParameterValueFromQueryParams(
  parameter: Parameter,
  queryParams: ParameterValuesMap,
  lastUsedParametersValues?: ParameterValuesMap,
): ParameterValueOrArray | null {
  const params: ParameterValuesMap = queryParams || {};
  const lastUsedValues: ParameterValuesMap = lastUsedParametersValues || {};

  const maybeParameterValue = params[parameter.slug || parameter.id];
  const hasQueryParams = Object.keys(params).length > 0;

  // don't use the default with "param=" because it indicates an unset/cleared parameter value
  if (maybeParameterValue === "") {
    return null;
  } else if (maybeParameterValue == null) {
    // If there is a parameter with a value set in the URL, do not use last used
    // parameter values (metabase#48524). This avoids a case where some
    // parameters are set via the URL and some have values from the last run.
    if (hasQueryParams) {
      return parameter.default ?? null;
    } else {
      return lastUsedValues[parameter.id] ?? parameter.default ?? null;
    }
  }

  const parsedValue = parseParameterValue(maybeParameterValue, parameter);

  // @ts-expect-error: normalizeParameterValueForWidget returns more than just
  // ParameterValueOrArray, which is probably a mistake.
  // This case was previously hidden by an any type.
  return normalizeParameterValueForWidget(parsedValue, parameter);
}

export function parseParameterValue(value: any, parameter: Parameter) {
  const type = getParameterType(parameter);
  if (type === "temporal-unit") {
    const availableUnits = Lib.availableTemporalUnits();
    return availableUnits.some((unit) => unit === value) ? value : null;
  }

  const coercedValue =
    Array.isArray(value) && !getIsMultiSelect(parameter) ? [value[0]] : value;

  // TODO this casting should be removed as we tidy up Parameter types
  const { fields } = parameter as FieldFilterUiParameter;
  if (Array.isArray(fields) && fields.length > 0) {
    return parseParameterValueForFields(type, coercedValue, fields);
  }

  // Note:
  // - "string" parameters can be mapped to anything (string, number, boolean)
  // - "category" and "id" parameters can be mapped to anything
  // We cannot properly deserialize their values by checking the parameter type only
  switch (type) {
    case "number":
      return parseParameterValueForNumber(type, coercedValue);
    case "location":
      return normalizeStringParameterValue(coercedValue);
    case "date":
      return normalizeDateParameterValue(coercedValue);
    case "boolean":
      return normalizeBooleanParameterValue(coercedValue);
    case "temporal-unit":
      return normalizeTemporalUnitParameterValue(coercedValue);
  }

  return coercedValue;
}

function parseParameterValueForNumber(
  type: ParameterType,
  value: ParameterValueOrArray,
) {
  // HACK to support multiple values for SQL parameters
  // https://github.com/metabase/metabase/issues/25374#issuecomment-1272520560
  if (typeof value === "string") {
    // something like "1,2,3",  "1, 2,  3", ",,,1,2, 3"
    const splitValues = value.split(",").filter((item) => item.trim() !== "");
    if (splitValues.length === 0) {
      return null;
    }

    if (splitValues.length > 1) {
      const numbers = splitValues.map((number) => parseFloat(number));
      if (numbers.every((number) => !isNaN(number))) {
        return numbers.join(",");
      }

      return null;
    }
  }

  return normalizeNumberParameterValue(type, value);
}

function parseParameterValueForFields(
  type: ParameterType,
  value: ParameterValueOrArray,
  fields: Field[],
): ParameterValueOrArray {
  // unix dates fields are numeric but query params shouldn't be parsed as numbers
  if (fields.every((f) => f.isNumeric() && !f.isDate())) {
    return normalizeNumberParameterValue(type, value);
  }

  if (fields.every((f) => f.isBoolean())) {
    return normalizeBooleanParameterValue(value);
  }

  if (fields.every((f) => f.isString() || f.isStringLike())) {
    return normalizeStringParameterValue(value);
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
  queryParams: ParameterValuesMap,
  lastUsedParametersValues?: ParameterValuesMap,
): ParameterValuesMap {
  const result: ParameterValuesMap = {};
  for (const parameter of parameters) {
    result[parameter.id] = getParameterValueFromQueryParams(
      parameter,
      queryParams,
      lastUsedParametersValues,
    );
  }
  return result;
}
