import _ from "underscore";
import { getParameterType } from "./parameter-type";

export function getParameterIconName(parameter) {
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

export function buildHiddenParametersSlugSet(hiddenParameterSlugs) {
  return _.isString(hiddenParameterSlugs)
    ? new Set(hiddenParameterSlugs.split(","))
    : new Set();
}

export function getVisibleParameters(parameters, hiddenParameterSlugs) {
  const hiddenParametersSlugSet = buildHiddenParametersSlugSet(
    hiddenParameterSlugs,
  );

  return parameters.filter(p => !hiddenParametersSlugSet.has(p.slug));
}
