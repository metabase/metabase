import { t } from "ttag";

import {
  ID_OPTION,
  OPTIONS_WITH_OPERATOR_SUBTYPES,
  PARAMETER_OPERATOR_TYPES,
} from "../constants";
import { buildTypedOperatorOptions, getOperatorDisplayName } from "./operators";
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
  if (options.length === 0) {
    return;
  }

  const widgetType = tag["widget-type"];
  if (widgetType && options.some(option => option.type === widgetType)) {
    return widgetType;
  }

  const defaultOption = options.find(option => option.default);
  if (defaultOption) {
    return defaultOption.type;
  } else {
    return options[0].type;
  }
}
