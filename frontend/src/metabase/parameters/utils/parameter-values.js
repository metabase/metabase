import { getParameterType } from "metabase-lib/parameters/utils/parameter-type";
import { hasParameterValue } from "metabase-lib/parameters/utils/parameter-values";

export function getParameterValueFromQueryParams(
  parameter,
  queryParams,
  metadata,
) {
  queryParams = queryParams || {};

  const maybeParameterValue = queryParams[parameter.slug || parameter.id];

  // skip parsing "" because it indicates a forcefully unset parameter
  if (maybeParameterValue === "") {
    return "";
  } else if (hasParameterValue(maybeParameterValue)) {
    const parsedValue = parseParameterValue(maybeParameterValue, parameter);
    return normalizeParameterValueForWidget(parsedValue, parameter);
  } else {
    return parameter.default;
  }
}

export function parseParameterValue(value, parameter) {
  const { fields } = parameter;
  if (Array.isArray(fields) && fields.length > 0) {
    return parseParameterValueForFields(value, fields);
  }

  const type = getParameterType(parameter);
  if (type === "number") {
    return parseParameterValueForNumber(value);
  }

  return value;
}

function parseParameterValueForNumber(value) {
  // something like "1,2,3",  "1, 2,  3", ",,,1,2, 3"
  const valueSplitByCommas = value
    .split(",")
    .filter(item => item.trim() !== "");

  if (valueSplitByCommas.length === 0) {
    return;
  }

  const isCommaSeparatedListOfNumbers =
    valueSplitByCommas.length > 1 &&
    valueSplitByCommas.every(item => !isNaN(parseFloat(item)));

  if (isCommaSeparatedListOfNumbers) {
    // "1, 2,    3" will be tranformed into "1,2,3" for later use
    return valueSplitByCommas.map(item => parseFloat(item)).join(",");
  }

  return parseFloat(value);
}

function parseParameterValueForFields(value, fields) {
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

function normalizeParameterValueForWidget(value, parameter) {
  const fieldType = getParameterType(parameter);
  if (fieldType !== "date" && !Array.isArray(value)) {
    return [value];
  }

  return value;
}

// on dashboards we treat a default parameter with a set value of "" (from a query parameter)
// to mean that the parameter value is explicitly unset.
// this is NOT the case elsewhere (native questions, pulses) because default values are
// automatically used in the query when unset.
function removeAllEmptyStringParameters(pairs) {
  return pairs
    .map(([parameter, value]) => [parameter, value === "" ? undefined : value])
    .filter(([parameter, value]) => hasParameterValue(value));
}

function removeUndefaultedEmptyStringParameters(pairs) {
  return pairs
    .map(([parameter, value]) => [
      parameter,
      value === "" ? parameter.default : value,
    ])
    .filter(([, value]) => hasParameterValue(value));
}

// when `forcefullyUnsetDefaultedParametersWithEmptyStringValue` is true, we treat defaulted parameters with an empty string value as explecitly unset.
// This CAN'T be used with native questions because defaulted parameters are always applied on the BE when unset on the FE.
export function getParameterValuesByIdFromQueryParams(
  parameters,
  queryParams,
  metadata,
  { forcefullyUnsetDefaultedParametersWithEmptyStringValue } = {},
) {
  const parameterValuePairs = parameters.map(parameter => [
    parameter,
    getParameterValueFromQueryParams(parameter, queryParams, metadata),
  ]);

  const transformedPairs =
    forcefullyUnsetDefaultedParametersWithEmptyStringValue
      ? removeAllEmptyStringParameters(parameterValuePairs)
      : removeUndefaultedEmptyStringParameters(parameterValuePairs);

  const idValuePairs = transformedPairs.map(([parameter, value]) => [
    parameter.id,
    value,
  ]);

  return Object.fromEntries(idValuePairs);
}
