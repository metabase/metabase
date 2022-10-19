import _ from "underscore";
import { humanize } from "metabase/lib/formatting";

import type {
  ActionDashboardCard,
  ActionParametersMapping,
  ClickBehaviorParameterMapping,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";
import type { UiParameter } from "metabase/parameters/types";

export function turnDashCardParameterMappingsIntoClickBehaviorMappings(
  dashCard: ActionDashboardCard,
  parameters: UiParameter[],
  action: WritebackAction,
): ClickBehaviorParameterMapping {
  const result: ClickBehaviorParameterMapping = {};

  if (!Array.isArray(dashCard.parameter_mappings)) {
    return result;
  }

  dashCard.parameter_mappings.forEach(mapping => {
    const { parameter_id: sourceParameterId, target } = mapping;

    const sourceParameter = parameters.find(
      parameter => parameter.id === sourceParameterId,
    );
    const actionParameter = action?.parameters.find(p =>
      _.isEqual(p.target, target),
    );

    if (sourceParameter && actionParameter) {
      result[actionParameter.id] = {
        id: actionParameter.id,
        target: {
          type: "parameter",
          id: actionParameter.id,
        },
        source: {
          type: "parameter",
          id: sourceParameter.id,
          name: sourceParameter.name,
        },
      };
    }
  });

  return result;
}

export function turnClickBehaviorParameterMappingsIntoDashCardMappings(
  clickBehaviorParameterMappings: ClickBehaviorParameterMapping,
  action: WritebackAction,
): ActionParametersMapping[] {
  const mappings = Object.values(clickBehaviorParameterMappings);
  const parameter_mappings: ActionParametersMapping[] = [];

  mappings.forEach(mapping => {
    const { source, target } = mapping;
    const actionParameter = action?.parameters.find(
      parameter => parameter.id === target.id,
    );

    if (actionParameter?.target) {
      parameter_mappings.push({
        parameter_id: source.id,
        target: actionParameter?.target,
      });
    }
  });

  return parameter_mappings;
}

export function ensureParamsHaveNames(
  parameters: WritebackParameter[],
): WritebackParameter[] {
  return parameters.map(parameter => ({
    ...parameter,
    name: parameter.name ?? humanize(parameter.id),
  }));
}
