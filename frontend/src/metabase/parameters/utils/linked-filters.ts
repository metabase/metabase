import {
  FIELD_FILTER_PARAMETER_TYPES,
  TYPE_SUPPORTS_LINKED_FILTERS,
} from "metabase-lib/v1/parameters/constants";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

export function canUseLinkedFilters(parameter: Parameter): boolean {
  const type = getParameterType(parameter);
  return (TYPE_SUPPORTS_LINKED_FILTERS as readonly string[]).includes(type);
}

export function usableAsLinkedFilter(parameter: Parameter): boolean {
  const type = getParameterType(parameter);
  return FIELD_FILTER_PARAMETER_TYPES.includes(type);
}
