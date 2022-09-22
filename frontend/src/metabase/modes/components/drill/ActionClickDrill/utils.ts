import _ from "underscore";
import { isEmpty } from "metabase/lib/validate";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  ParameterMappedForActionExecution,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

function formatParameterValue(value: ParameterValueOrArray) {
  return Array.isArray(value) ? value[0] : value;
}

export function getDashcardParamValues(
  dashcard: ActionDashboardCard,
  parameterValues: { [id: string]: ParameterValueOrArray },
) {
  if (!dashcard.action || !dashcard?.parameter_mappings?.length) {
    return [];
  }
  const { action, parameter_mappings } = dashcard;

  return parameter_mappings
    .map(mapping => prepareParameter(mapping, action, parameterValues))
    .filter(Boolean) as ParameterMappedForActionExecution[];
}

export function prepareParameter(
  mapping: ActionParametersMapping,
  action: WritebackAction,
  parameterValues: { [id: string]: ParameterValueOrArray },
) {
  const { parameter_id: sourceParameterId, target: actionParameterTarget } =
    mapping;

  const parameterValue = parameterValues[sourceParameterId];
  const actionParameter = action.parameters.find(parameter =>
    _.isEqual(parameter.target, actionParameterTarget),
  );

  // dont return unmapped or empty values
  if (!actionParameter || isEmpty(parameterValue)) {
    return;
  }

  return {
    id: sourceParameterId,
    type: actionParameter.type,
    value: formatParameterValue(parameterValue),
    target: actionParameterTarget,
  };
}

function isMappedParameter(
  parameter: WritebackParameter,
  parameterMappings: ParameterMappedForActionExecution[],
) {
  return parameterMappings.some(mapping =>
    _.isEqual(mapping.target, parameter.target),
  );
}

export function getNotProvidedActionParameters(
  action: WritebackAction,
  dashboardParamValues: ParameterMappedForActionExecution[],
) {
  // return any action parameters that don't have mapped values
  return action.parameters.filter(parameter => {
    if ("default" in parameter) {
      return false;
    }
    return !isMappedParameter(parameter, dashboardParamValues);
  });
}
