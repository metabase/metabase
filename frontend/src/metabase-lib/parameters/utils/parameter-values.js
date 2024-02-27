import _ from "underscore";

import {
  getQueryType,
  getSourceConfig,
  getSourceType,
} from "./parameter-source";
import { getParameterType } from "./parameter-type";

export const PULSE_PARAM_EMPTY = null;
export const PULSE_PARAM_USE_DEFAULT = undefined;

export function getValuePopulatedParameters(
  parameters,
  parameterValues,
  collectionPreview,
) {
  // pinned native question can have default values on parameters, usually we
  // get them from URL, which is not the case for collection preview. to force
  // BE to apply default values to those filters, empty array is provided
  if (collectionPreview) {
    return [];
  }

  return parameters.map(parameter => ({
    ...parameter,
    value: parameterValues?.[parameter.id] ?? null,
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

export function hasDefaultParameterValue(parameter) {
  return parameter.default != null;
}

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

export function isParameterValueEmpty(value) {
  return (
    value === PULSE_PARAM_EMPTY ||
    (Array.isArray(value) && value.length === 0) ||
    value === ""
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
