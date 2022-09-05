import { getDataFromClicked } from "metabase/lib/click-behavior";

import {
  executeRowAction,
  openActionParametersModal,
} from "metabase/dashboard/actions";

import type { ParameterMappedForActionExecution } from "metabase-types/api";
import type { ActionClickObject } from "./types";

import { prepareParameter, getNotProvidedActionParameters } from "./utils";

function ActionClickDrill({ clicked }: { clicked: ActionClickObject }) {
  const { dashboard, dashcard } = clicked.extraData;
  const { action } = dashcard;

  if (!action) {
    return [];
  }

  const parameters: ParameterMappedForActionExecution[] = [];
  const data = getDataFromClicked(clicked);
  const parameterMappings = dashcard.parameter_mappings || [];

  parameterMappings.forEach(mapping => {
    const parameter = prepareParameter(mapping, { action, data });
    if (parameter) {
      parameters.push(parameter);
    }
  });

  const missingParameters = getNotProvidedActionParameters(
    action,
    parameterMappings,
    parameters,
  );

  function clickAction() {
    if (missingParameters.length > 0) {
      return openActionParametersModal({
        dashcardId: dashcard.id,
        props: {
          missingParameters,
          onSubmit: (filledParameters: ParameterMappedForActionExecution[]) =>
            executeRowAction({
              dashboard,
              dashcard,
              parameters: [...parameters, ...filledParameters],
            }),
        },
      });
    }
    return executeRowAction({
      dashboard,
      dashcard,
      parameters,
    });
  }

  return [
    {
      name: "click_behavior",
      default: true,
      defaultAlways: true,
      action: clickAction,
    },
  ];
}

export default ActionClickDrill;
