import _ from "underscore";

import type { IconName } from "metabase/ui";
import { isEqualsOperator } from "metabase-lib/v1/operators/utils";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";

export function getParameterIconName(
  parameter: UiParameter | string,
): IconName {
  const type = getParameterType(parameter);
  switch (type) {
    case "date":
      return "calendar";
    case "location":
      return "location";
    case "string":
    case "category":
      return "string";
    case "number":
      return "number";
    case "temporal-unit":
      return "clock";
    case "id":
    default:
      return "label";
  }
}

export function buildHiddenParametersSlugSet(
  hiddenParameterSlugs: string | null | undefined,
) {
  return _.isString(hiddenParameterSlugs)
    ? new Set(hiddenParameterSlugs.split(","))
    : new Set();
}

export function getVisibleParameters(
  parameters: UiParameter[],
  hiddenParameterSlugs?: string | null,
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
