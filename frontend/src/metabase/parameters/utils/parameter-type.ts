import { Parameter } from "metabase-types/api";
import {
  CUSTOM_SOURCE_PARAMETER_TYPES,
  SINGLE_OR_MULTI_SELECTABLE_TYPES,
} from "metabase-lib/parameters/constants";
import {
  getParameterType,
  getParameterSubType,
} from "metabase-lib/parameters/utils/parameter-type";

export function isSingleOrMultiSelectable(parameter: Parameter): boolean {
  const type: string = getParameterType(parameter);
  const subType: string = getParameterSubType(parameter);

  if (!SINGLE_OR_MULTI_SELECTABLE_TYPES[type]) {
    return false;
  }
  if (SINGLE_OR_MULTI_SELECTABLE_TYPES[type] === "any") {
    return true;
  }
  return SINGLE_OR_MULTI_SELECTABLE_TYPES[type].includes(subType);
}

export const canUseCustomSource = (parameter: Parameter) => {
  const type = getParameterType(parameter);
  const subType = getParameterSubType(parameter);

  return (
    CUSTOM_SOURCE_PARAMETER_TYPES[type] != null &&
    CUSTOM_SOURCE_PARAMETER_TYPES[type].includes(subType)
  );
};
