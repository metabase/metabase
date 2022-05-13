import {
  TYPE_SUPPORTS_LINKED_FILTERS,
  TYPE_USABLE_AS_LINKED_FILTER,
} from "metabase/parameters/constants";
import { getParameterType } from "metabase/parameters/utils/parameter-type";

export function canUseLinkedFilters(parameter) {
  const type = getParameterType(parameter);
  return TYPE_SUPPORTS_LINKED_FILTERS.includes(type);
}

export function usableAsLinkedFilter(parameter) {
  const type = getParameterType(parameter);
  return TYPE_USABLE_AS_LINKED_FILTER.includes(type);
}
