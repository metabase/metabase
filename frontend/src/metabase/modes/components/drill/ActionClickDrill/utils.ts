import _ from "underscore";

import type {
  ActionButtonParametersMapping,
  WritebackAction,
} from "metabase-types/api";
import type { ParameterValueOrArray } from "metabase-types/types/Parameter";

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
  };
}
