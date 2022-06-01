import {
  TYPE_SUPPORTS_LINKED_FILTERS,
  FIELD_FILTER_PARAMETER_TYPES,
} from "metabase/parameters/constants";
import { getParameterType } from "metabase/parameters/utils/parameter-type";

export function canUseLinkedFilters(parameter) {
  const type = getParameterType(parameter);
  return TYPE_SUPPORTS_LINKED_FILTERS.includes(type);
}

export function usableAsLinkedFilter(parameter) {
  const type = getParameterType(parameter);
  return FIELD_FILTER_PARAMETER_TYPES.includes(type);
}
