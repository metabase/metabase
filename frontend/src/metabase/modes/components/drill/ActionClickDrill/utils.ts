import _ from "underscore";

import type {
  ActionButtonParametersMapping,
  ParameterMappedForActionExecution,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";
import type {
  ParameterTarget,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";

import type { ActionClickBehaviorData } from "./types";

function formatParameterValue(value: ParameterValueOrArray) {
  return Array.isArray(value) ? value[0] : value;
}

export function prepareParameter(
  mapping: ActionButtonParametersMapping,
  {
    data,
    action,
  }: {
    data: ActionClickBehaviorData;
    action: WritebackAction;
  },
) {
  const { parameter_id: sourceParameterId, target: actionParameterTarget } =
    mapping;

  const sourceParameter = data.parameter[sourceParameterId];
  const actionParameter = action.parameters.find(parameter =>
    _.isEqual(parameter.target, actionParameterTarget),
  );

  if (!actionParameter || !sourceParameter) {
    return;
  }

  return {
    id: sourceParameterId,
    type: actionParameter.type,
    value: formatParameterValue(sourceParameter.value),
    target: actionParameterTarget,
  };
}

function isMappedParameter(
  parameter: WritebackParameter,
  parameterMappings: ActionButtonParametersMapping[],
) {
  return parameterMappings.some(mapping =>
    _.isEqual(mapping.target, parameter.target),
  );
}

export function getNotProvidedActionParameters(
  action: WritebackAction,
  parameterMappings: ActionButtonParametersMapping[],
  mappedParameters: ParameterMappedForActionExecution[],
) {
  const emptyParameterTargets: ParameterTarget[] = [];

  mappedParameters.forEach(mapping => {
    if (mapping.value === undefined) {
      emptyParameterTargets.push(mapping.target);
    }
  });

  return action.parameters.filter(parameter => {
    if ("default" in parameter) {
      return false;
    }
    const isNotMapped = !isMappedParameter(parameter, parameterMappings);
    const isMappedButNoValue = emptyParameterTargets.some(target =>
      _.isEqual(target, parameter.target),
    );
    return isNotMapped || isMappedButNoValue;
  });
}
