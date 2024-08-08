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
  queryParams: Record<string, string | string[] | null | undefined>,
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
  const coercedValue =
    Array.isArray(value) && !getIsMultiSelect(parameter) ? [value[0]] : value;

  // TODO this casting should be removed as we tidy up Parameter types
  const { fields } = parameter as FieldFilterUiParameter;
  if (Array.isArray(fields) && fields.length > 0) {
    return parseParameterValueForFields(coercedValue, fields);
  }

  const type = getParameterType(parameter);
  if (type === "number") {
    return parseParameterValueForNumber(coercedValue);
  }

  return coercedValue;
}

function parseParameterValueForNumber(value: string | string[]) {
  if (Array.isArray(value)) {
    const numbers = value.map(number => parseFloat(number));
    return numbers.every(number => !isNaN(number)) ? numbers : null;
  }

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

  const number = parseFloat(value);
  return isNaN(number) ? null : number;
}

function parseParameterValueForFields(
  value: string | string[],
  fields: Field[],
): ParameterValueOrArray | boolean {
  if (Array.isArray(value)) {
    return value.map(v => parseParameterValueForFields(v, fields));
  }

  // unix dates fields are numeric but query params shouldn't be parsed as numbers
  if (fields.every(f => f.isNumeric() && !f.isDate())) {
    return parseFloat(value);
  }

  if (fields.every(f => f.isBoolean())) {
    return value === "true" ? true : value === "false" ? false : value;
  }

  return value;
}

function normalizeParameterValueForWidget(
  value: ParameterValue,
  parameter: Parameter,
) {
  const fieldType = getParameterType(parameter);
  if (value != null && fieldType !== "date" && !Array.isArray(value)) {
    return [value];
  }

  return value;
}

export function getParameterValuesByIdFromQueryParams(
  parameters: Parameter[],
  queryParams: Record<string, string | string[] | null | undefined>,
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
