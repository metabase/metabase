import _ from "underscore";
import { isEmpty } from "metabase/lib/validate";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  ParametersForActionExecution,
  WritebackAction,
  WritebackParameter,
  ParameterId,
  ActionParameterValue,
} from "metabase-types/api";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

function formatParameterValue(value: ParameterValueOrArray) {
  return Array.isArray(value) ? value[0] : value;
}

type ActionParameterTuple = [ParameterId, ActionParameterValue];

export function getDashcardParamValues(
  dashcard: ActionDashboardCard,
  parameterValues: { [id: string]: ParameterValueOrArray },
): ParametersForActionExecution {
  if (!dashcard.action || !dashcard?.parameter_mappings?.length) {
    return {};
  }
  const { action, parameter_mappings } = dashcard;

  return Object.fromEntries(
    parameter_mappings
      ?.map(mapping => prepareParameter(mapping, action, parameterValues))
      ?.filter(Boolean) as ActionParameterTuple[],
  );
}

export function prepareParameter(
  mapping: ActionParametersMapping,
  action: WritebackAction,
  parameterValues: { [id: string]: ParameterValueOrArray },
): ActionParameterTuple | undefined {
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

  return [actionParameter.id, formatParameterValue(parameterValue)];
}

function isMappedParameter(
  parameter: WritebackParameter,
  dashboardParamValues: ParametersForActionExecution,
) {
  return parameter.id in dashboardParamValues;
}

export function getNotProvidedActionParameters(
  action: WritebackAction,
  dashboardParamValues: ParametersForActionExecution,
) {
  // return any action parameters that don't have mapped values
  return (action.parameters ?? []).filter(parameter => {
    if ("default" in parameter) {
      return false;
    }
    return !isMappedParameter(parameter, dashboardParamValues);
  });
}
