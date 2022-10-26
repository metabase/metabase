import { getParameterType } from "metabase-lib/parameters/utils/parameter-type";

export function getValuePopulatedParameters(parameters, parameterValues) {
  return parameterValues
    ? parameters.map(parameter => {
        return parameter.id in parameterValues
          ? {
              ...parameter,
              value: parameterValues[parameter.id],
            }
          : parameter;
      })
    : parameters;
}

export function hasDefaultParameterValue(parameter) {
  return parameter.default != null;
}

export function hasParameterValue(value) {
  return value != null;
}

export function normalizeParameterValue(type, value) {
  const fieldType = getParameterType(type);

  if (["string", "number"].includes(fieldType)) {
    return value == null ? [] : [].concat(value);
  } else {
    return value;
  }
}

function removeNilValuedPairs(pairs) {
  return pairs.filter(([, value]) => hasParameterValue(value));
}

function removeUndefaultedNilValuedPairs(pairs) {
  return pairs.filter(
    ([parameter, value]) =>
      hasDefaultParameterValue(parameter) || hasParameterValue(value),
  );
}

// when `preserveDefaultedParameters` is true, we don't remove defaulted parameters with nil values
// so that they can be set in the URL query without a value. Used alongside `getParameterValuesByIdFromQueryParams`
// with `forcefullyUnsetDefaultedParametersWithEmptyStringValue` set to true.
export function getParameterValuesBySlug(
  parameters,
  parameterValuesById,
  { preserveDefaultedParameters } = {},
) {
  parameters = parameters || [];
  parameterValuesById = parameterValuesById || {};
  const parameterValuePairs = parameters.map(parameter => [
    parameter,
    hasParameterValue(parameter.value)
      ? parameter.value
      : parameterValuesById[parameter.id],
  ]);

  const transformedPairs = preserveDefaultedParameters
    ? removeUndefaultedNilValuedPairs(parameterValuePairs)
    : removeNilValuedPairs(parameterValuePairs);

  const slugValuePairs = transformedPairs.map(([parameter, value]) => [
    parameter.slug,
    value,
  ]);

  return Object.fromEntries(slugValuePairs);
}
