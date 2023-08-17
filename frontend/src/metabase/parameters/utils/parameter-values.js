import { getParameterType } from "metabase-lib/parameters/utils/parameter-type";

export function getParameterValueFromQueryParams(parameter, queryParams) {
  queryParams = queryParams || {};

  const maybeParameterValue = queryParams[parameter.slug || parameter.id];

  // parse "" as null because it indicates a forcefully unset parameter
  if (maybeParameterValue === "") {
    return null;
  } else if (maybeParameterValue == null) {
    return parameter.default;
  } else {
    const parsedValue = parseParameterValue(maybeParameterValue, parameter);
    return normalizeParameterValueForWidget(parsedValue, parameter);
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
  if (Array.isArray(value)) {
    return value.map(number => parseFloat(number));
  }

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

export function getParameterValuesByIdFromQueryParams(parameters, queryParams) {
  return Object.fromEntries(
    parameters.map(parameter => [
      parameter.id,
      getParameterValueFromQueryParams(parameter, queryParams),
    ]),
  );
}
