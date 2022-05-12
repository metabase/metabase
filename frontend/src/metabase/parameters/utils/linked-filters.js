import { getParameterType } from "./parameter-type";

export function canUseLinkedFilters(parameter) {
  const type = getParameterType(parameter);
  return ["string", "category", "id", "location"].includes(type);
}
