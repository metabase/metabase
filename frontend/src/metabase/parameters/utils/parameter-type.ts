import { SINGLE_OR_MULTI_SELECTABLE_TYPES } from "metabase-lib/v1/parameters/constants";
import type { ParameterWithTemplateTagTarget } from "metabase-lib/v1/parameters/types";
import {
  getParameterSubType,
  getParameterType,
} from "metabase-lib/v1/parameters/utils/parameter-type";

export function isSingleOrMultiSelectable(
  parameter: ParameterWithTemplateTagTarget,
): boolean {
  const type: string = getParameterType(parameter);
  const subType: string = getParameterSubType(parameter);

  if (
    !SINGLE_OR_MULTI_SELECTABLE_TYPES[type] ||
    parameter.hasVariableTemplateTagTarget
  ) {
    return false;
  }
  if (SINGLE_OR_MULTI_SELECTABLE_TYPES[type] === "any") {
    return true;
  }
  return SINGLE_OR_MULTI_SELECTABLE_TYPES[type].includes(subType);
}
