import { TYPE_SUPPORTS_LINKED_FILTERS } from "metabase/parameters/constants";
import { getParameterType } from "metabase/parameters/utils/parameter-type";

export function canUseLinkedFilters(parameter) {
  const type = getParameterType(parameter);
  return TYPE_SUPPORTS_LINKED_FILTERS.includes(type);
}
