import _ from "underscore";

import {
  getQueryType,
  getSourceConfig,
  getSourceType,
} from "./parameter-source";
import { getParameterType } from "./parameter-type";

export const PULSE_PARAM_EMPTY = null;
export const PULSE_PARAM_USE_DEFAULT = undefined;

/**
 * In some cases, we need to use default parameter value in place of an absent one.
 * Please use this function when dealing with the required parameters.
 */
export function getParameterValue({
  parameter,
  values = {},
  defaultRequired = false,
  lastUsedParameterValue = null,
}) {
  const value = values?.[parameter.id];
  const useDefault = defaultRequired && parameter.required;

  return (
    lastUsedParameterValue ?? value ?? (useDefault ? parameter.default : null)
  );
}

/**
 * In some cases, we need to use default parameter value in place of an absent one.
 * Please use this function when dealing with the required parameters.
 */
export function getValuePopulatedParameters({
  parameters,
  values = {},
  defaultRequired = false,
  collectionPreview = false,
}) {
  // pinned native question can have default values on parameters, usually we
  // get them from URL, which is not the case for collection preview. to force
  // BE to apply default values to those filters, empty array is provided
  if (collectionPreview) {
    return [];
  }

  return parameters.map(parameter => ({
    ...parameter,
    value: getParameterValue({
      parameter,
      values,
      defaultRequired,
    }),
  }));
}

export function getDefaultValuePopulatedParameters(
  parameters,
  parameterValues,
) {
  return parameters.map(parameter => {
    const value = parameterValues?.[parameter.id];
    return {
      ...parameter,
      value: value === PULSE_PARAM_USE_DEFAULT ? parameter.default : value,
    };
  });
}

// Needed because parameter values might be arrays
// in which case order of elements isn't guaranteed
export function areParameterValuesIdentical(a, b) {
  return _.isEqual(
    Array.isArray(a) ? a.slice().sort() : a,
    Array.isArray(b) ? b.slice().sort() : b,
  );
}

/**
 * @import { NormalizedParameter } from "metabase-types/api";
 *
 * @returns {NormalizedParameter}
 */
export function normalizeParameter(parameter) {
  return {
    id: parameter.id,
    name: parameter.name,
    slug: parameter.slug,
    type: parameter.type,
    target: parameter.target,
    options: parameter.options,
    values_query_type: getQueryType(parameter),
    values_source_type: getSourceType(parameter),
    values_source_config: getSourceConfig(parameter),
  };
}

export function normalizeParameters(parameters) {
  return parameters
    .filter(parameter => _.has(parameter, "value"))
    .map(({ id, type, value, target, options }) => ({
      id,
      type,
      value: normalizeParameterValue(type, value),
      target,
      options,
    }));
}

// This distinguishes between empty value (deliberately unset), which is null,
// and no value, which is undefined. Needed in API requests.
// TODO reconcile with hasNoValueToShow
export function isParameterValueEmpty(value) {
  return (
    value === PULSE_PARAM_EMPTY ||
    (Array.isArray(value) && value.length === 0) ||
    value === ""
  );
}

// This is a UI-bound function used to render filter widget.
// Should treat undefined and null equally.
// TODO reconcile with isParameterValueEmpty
export function parameterHasNoDisplayValue(value) {
  return (
    (!value && value !== 0) ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function normalizeParameterValue(type, value) {
  const fieldType = getParameterType(type);
  if (value === PULSE_PARAM_USE_DEFAULT) {
    return PULSE_PARAM_USE_DEFAULT;
  } else if (isParameterValueEmpty(value)) {
    return PULSE_PARAM_EMPTY;
  } else if (["string", "number"].includes(fieldType)) {
    return [].concat(value);
  } else {
    return value;
  }
}

export function getParameterValuesBySlug(parameters, parameterValuesById) {
  parameters = parameters ?? [];
  parameterValuesById = parameterValuesById ?? {};

  return Object.fromEntries(
    parameters.map(parameter => [
      parameter.slug,
      parameter.value ?? parameterValuesById[parameter.id] ?? null,
    ]),
  );
}

export function getIsMultiSelect(parameter) {
  return parameter.isMultiSelect ?? true;
}
