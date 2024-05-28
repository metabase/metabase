import _ from "underscore";

import { isImplicitDeleteAction } from "metabase/actions/utils";
import { isNotNull } from "metabase/lib/types";
import { isEmpty } from "metabase/lib/validate";
import type {
  ActionDashboardCard,
  ActionParametersMapping,
  ActionParameterValue,
  ParameterId,
  ParametersForActionExecution,
  ParameterValueOrArray,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

type ActionParameterTuple = [ParameterId, ActionParameterValue];

function formatParameterValue(value: ParameterValueOrArray) {
  return Array.isArray(value) ? value[0] : value;
}

function prepareParameter(
  mapping: ActionParametersMapping,
  action: WritebackAction,
  parameterValues: { [id: string]: ParameterValueOrArray },
): ActionParameterTuple | undefined {
  if (!action?.parameters?.length) {
    return;
  }
  const { parameter_id: sourceParameterId, target: actionParameterTarget } =
    mapping;

  const parameterValue = parameterValues[sourceParameterId];
  const actionParameter = action.parameters.find(parameter =>
    _.isEqual(parameter.target, actionParameterTarget),
  );

  // don't return unmapped or empty values
  if (!actionParameter || isEmpty(parameterValue)) {
    return;
  }

  return [actionParameter.id, formatParameterValue(parameterValue)];
}

export function getDashcardParamValues(
  dashcard: ActionDashboardCard,
  parameterValues: { [id: string]: ParameterValueOrArray },
): ParametersForActionExecution {
  if (
    !dashcard.action ||
    !dashcard?.parameter_mappings?.length ||
    !parameterValues
  ) {
    return {};
  }
  const { action, parameter_mappings } = dashcard;

  return Object.fromEntries(
    parameter_mappings
      ?.map(mapping => prepareParameter(mapping, action, parameterValues))
      ?.filter(isNotNull),
  );
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

export function getMappedActionParameters(
  action: WritebackAction,
  dashboardParamValues: ParametersForActionExecution,
) {
  const parameters = action.parameters ?? [];
  return parameters.filter(parameter => {
    return isMappedParameter(parameter, dashboardParamValues);
  });
}

export const shouldShowConfirmation = (action?: WritebackAction) => {
  if (!action) {
    return false;
  }
  const hasConfirmationMessage =
    !!action.visualization_settings?.confirmMessage;
  return hasConfirmationMessage || isImplicitDeleteAction(action);
};

export const isParameterHidden = (
  action: WritebackAction,
  parameter: WritebackParameter,
) => {
  return !!action.visualization_settings?.fields?.[parameter.id]?.hidden;
};

export const isParameterRequired = (
  action: WritebackAction,
  parameter: WritebackParameter,
) => {
  return !!(
    parameter.required ||
    action.visualization_settings?.fields?.[parameter.id]?.required
  );
};

export const getParameterDefaultValue = (
  action: WritebackAction,
  parameter: WritebackParameter,
) => {
  return action.visualization_settings?.fields?.[parameter.id]?.defaultValue;
};
