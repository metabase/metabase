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

const HIGH_CARDINALITY_THRESHOLD = 20;

export function getDefaultParameterWidgetType(tag, field) {
  const options = getParameterOptionsForField(field);
  const widgetType = tag["widget-type"];
  const distinctCount = field.fingerprint?.global["distinct-count"];
  const highCardinalityOption = options.find(option => option.highCardinality);

  if (options.length === 0) {
    return undefined;
  } else if (
    widgetType != null &&
    options.some(option => option.type === widgetType)
  ) {
    return widgetType;
  } else if (
    distinctCount != null &&
    distinctCount > HIGH_CARDINALITY_THRESHOLD &&
    highCardinalityOption != null
  ) {
    return highCardinalityOption.type;
  } else {
    return options[0].type;
  }
}
