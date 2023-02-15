import _ from "underscore";
import { UiParameter } from "metabase-lib/parameters/types";
import { isEqualsOperator } from "metabase-lib/operators/utils";

import { getParameterType } from "metabase-lib/parameters/utils/parameter-type";
import { deriveFieldOperatorFromParameter } from "metabase-lib/parameters/utils/operators";

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
  hiddenParameterSlugs?: string,
) {
  const hiddenParametersSlugSet =
    buildHiddenParametersSlugSet(hiddenParameterSlugs);

  return parameters.filter(
    p => !hiddenParametersSlugSet.has(p.slug) && !p.hidden,
  );
}

export function getParameterWidgetTitle(parameter: UiParameter) {
  const operator = deriveFieldOperatorFromParameter(parameter);
  const { verboseName } = operator || {};

  if (verboseName && !isEqualsOperator(operator)) {
    return `${verboseName}…`;
  }
}
