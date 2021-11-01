import { areFieldFilterOperatorsEnabled } from "./feature-flag";
import { getOperatorDisplayName } from "./operators";
import { fieldFilterForParameter } from "./filters";

import {
  OPTIONS_WITH_OPERATOR_SUBTYPES,
  PARAMETER_OPERATOR_TYPES,
  LOCATION_OPTIONS,
  ID_OPTION,
  CATEGORY_OPTION,
} from "../constants";

export function getParameterOptions() {
  return [
    ID_OPTION,
    ...(areFieldFilterOperatorsEnabled()
      ? OPTIONS_WITH_OPERATOR_SUBTYPES.map(option =>
          buildOperatorSubtypeOptions(option),
        )
      : [
          CATEGORY_OPTION,
          ...LOCATION_OPTIONS,
          ...PARAMETER_OPERATOR_TYPES["date"],
        ]),
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
