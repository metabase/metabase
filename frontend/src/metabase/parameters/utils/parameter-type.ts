import _ from "underscore";
import { Parameter } from "metabase-types/types/Parameter";
import { SINGLE_OR_MULTI_SELECTABLE_TYPES } from "metabase-lib/parameters/constants";
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
