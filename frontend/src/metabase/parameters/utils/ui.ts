import _ from "underscore";
import { isEqualsOperator } from "metabase/lib/schema_metadata";
import { UiParameter } from "metabase/parameters/types";

import { getParameterType } from "./parameter-type";
import { deriveFieldOperatorFromParameter } from "./operators";

export function getParameterIconName(parameter: UiParameter) {
  const type = getParameterType(parameter);
  switch (type) {
    case "date":
      return "calendar";
    case "location":
      return "location";
    case "category":
      return "string";
    case "number":
      return "number";
    case "id":
    default:
      return "label";
  }
}

export function buildHiddenParametersSlugSet(
  hiddenParameterSlugs: string | undefined,
) {
  return _.isString(hiddenParameterSlugs)
    ? new Set(hiddenParameterSlugs.split(","))
    : new Set();
}

export function getVisibleParameters(
  parameters: UiParameter[],
  hiddenParameterSlugs: string | undefined,
) {
  const hiddenParametersSlugSet =
    buildHiddenParametersSlugSet(hiddenParameterSlugs);

  return parameters.filter(p => !hiddenParametersSlugSet.has(p.slug));
}

export function getParameterWidgetTitle(parameter: UiParameter) {
  const operator = deriveFieldOperatorFromParameter(parameter);
  const { verboseName } = operator || {};

  if (verboseName && !isEqualsOperator(operator)) {
    return `${verboseName}…`;
  }
}
