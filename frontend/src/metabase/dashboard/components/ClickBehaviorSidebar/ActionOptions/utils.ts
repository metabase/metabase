import _ from "underscore";

import type {
  ActionButtonDashboardCard,
  ActionButtonParametersMapping,
  ClickBehaviorParameterMapping,
  WritebackAction,
} from "metabase-types/api";
import type { UiParameter } from "metabase/parameters/types";

export function turnDashCardParameterMappingsIntoClickBehaviorMappings(
  dashCard: ActionButtonDashboardCard,
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
): ActionButtonParametersMapping[] {
  const mappings = Object.values(clickBehaviorParameterMappings);
  const parameter_mappings: ActionButtonParametersMapping[] = [];

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
