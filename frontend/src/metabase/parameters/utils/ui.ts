import _ from "underscore";

import { isEqualsOperator } from "metabase-lib/v1/operators/utils";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";

export function getParameterIconName(parameter: UiParameter | string) {
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
