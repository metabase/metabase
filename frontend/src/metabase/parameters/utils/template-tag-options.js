import { t } from "ttag";

import {
  OPTIONS_WITH_OPERATOR_SUBTYPES,
  PARAMETER_OPERATOR_TYPES,
  ID_OPTION,
} from "metabase-lib/lib/parameters/constants";
import {
  getOperatorDisplayName,
  buildTypedOperatorOptions,
} from "metabase-lib/lib/parameters/utils/operators";
import { fieldFilterForParameter } from "metabase-lib/lib/parameters/utils/filters";

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
