import { t } from "ttag";

import {
  OPTIONS_WITH_OPERATOR_SUBTYPES,
  PARAMETER_OPERATOR_TYPES,
  ID_OPTION,
} from "../constants";
import { getOperatorDisplayName, buildTypedOperatorOptions } from "./operators";
import { fieldFilterForParameter } from "./filters";

export function getParameterOptions() {
  return [
    ID_OPTION,
    ...OPTIONS_WITH_OPERATOR_SUBTYPES.map(option =>
      buildOperatorSubtypeOptions(option),
    ),
    ...buildTypedOperatorOptions("string", "location", t`Location`),
  ].flat();
}

function buildOperatorSubtypeOptions({ type, typeName }) {
  return PARAMETER_OPERATOR_TYPES[type].map(option => ({
    ...option,
    combinedName: getOperatorDisplayName(option, type, typeName),
  }));
}

export function getParameterOptionsForField(field) {
  return getParameterOptions()
    .filter(option => fieldFilterForParameter(option)(field))
    .map(option => {
      return {
        ...option,
        name: option.combinedName || option.name,
      };
    });
}

export function getDefaultParameterWidgetType(tag, field) {
  const options = getParameterOptionsForField(field);

  if (
    tag["widget-type"] &&
    options.some(({ type }) => type === tag["widget-type"])
  ) {
    return tag["widget-type"];
  } else if (options.length > 0) {
    return options[0].type;
  }
}
