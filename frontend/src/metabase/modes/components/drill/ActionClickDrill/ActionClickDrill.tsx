import { getDataFromClicked } from "metabase/lib/click-behavior";

import { executeRowAction } from "metabase/dashboard/actions";

import type { ParameterMappedForActionExecution } from "metabase-types/api";
import type { ActionClickObject } from "./types";

import { prepareParameter } from "./utils";

function ActionClickDrill({ clicked }: { clicked: ActionClickObject }) {
  const { dashboard, dashcard } = clicked.extraData;
  const { action } = dashcard;

  if (!action) {
    return [];
  }

  const parameters: ParameterMappedForActionExecution[] = [];
  const data = getDataFromClicked(clicked);

  dashcard.parameter_mappings?.forEach?.(mapping => {
    const parameter = prepareParameter(mapping, { action, data });
    if (parameter) {
      parameters.push(parameter);
    }
  });

  return [
    {
      name: "click_behavior",
      default: true,
      defaultAlways: true,
      action: () =>
        executeRowAction({
          dashboard,
          dashcard,
          parameters,
        }),
    },
  ];
}

export default ActionClickDrill;
