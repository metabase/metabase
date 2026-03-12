import _ from "underscore";

import {
  FIELD_FILTER_PARAMETER_TYPES,
  TYPE_SUPPORTS_LINKED_FILTERS,
} from "metabase-lib/v1/parameters/constants";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { Parameter } from "metabase-types/api";

export function canUseLinkedFilters(parameter: Parameter) {
  const type = getParameterType(parameter);
  return _.includes(TYPE_SUPPORTS_LINKED_FILTERS, type);
}

export function usableAsLinkedFilter(parameter: Parameter) {
  const type = getParameterType(parameter);
  return FIELD_FILTER_PARAMETER_TYPES.includes(type);
}
