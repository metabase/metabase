import type { Query } from "history";

import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";
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

function parseParameterValue(value: any, parameter: Parameter) {
  // TODO this casting should be removed as we tidy up Parameter types
  const { fields } = parameter as FieldFilterUiParameter;
  if (Array.isArray(fields) && fields.length > 0) {
    return parseParameterValueForFields(value, fields);
  }

  const type = getParameterType(parameter);
  if (type === "number") {
    return parseParameterValueForNumber(value);
  }

  return value;
}

function parseParameterValueForNumber(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.map(number => parseFloat(number));
  }

  // something like "1,2,3",  "1, 2,  3", ",,,1,2, 3"
  const splitValues = value.split(",").filter(item => item.trim() !== "");

  if (splitValues.length === 0) {
    return;
  }

  const isNumberList =
    splitValues.length > 1 &&
    splitValues.every(item => !isNaN(parseFloat(item)));

  if (isNumberList) {
    // "1, 2,    3" will be tranformed into "1,2,3" for later use
    return splitValues.map(item => parseFloat(item)).join(",");
  }

  return parseFloat(value);
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
  if (fieldType !== "date" && !Array.isArray(value)) {
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
