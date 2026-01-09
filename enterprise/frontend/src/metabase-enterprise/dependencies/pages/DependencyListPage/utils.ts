import type * as Urls from "metabase/lib/urls";
import { DEPENDENCY_GROUP_TYPES, DEPENDENCY_TYPES } from "metabase-types/api";

import {
  parseBoolean,
  parseEnum,
  parseList,
  parseNumber,
  parseString,
} from "../../utils";

import type { DependencyListQueryParams } from "./types";

export function parseParams(
  params: DependencyListQueryParams,
): Urls.DependencyListParams {
  const selectedId = parseNumber(params.selectedId);
  const selectedType = parseEnum(params.selectedType, DEPENDENCY_TYPES);

  return {
    query: parseString(params.query),
    groupTypes: parseList(params.groupTypes, (item) =>
      parseEnum(item, DEPENDENCY_GROUP_TYPES),
    ),
    selectedEntry:
      selectedId != null && selectedType != null
        ? { id: selectedId, type: selectedType }
        : undefined,
    includeInDashboards: parseBoolean(params.includeInDashboards),
    includeInPersonalCollections: parseBoolean(
      params.includeInPersonalCollections,
    ),
  };
}
