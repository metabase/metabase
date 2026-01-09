import type * as Urls from "metabase/lib/urls";
import { DEPENDENCY_GROUP_TYPES } from "metabase-types/api";

import { parseBoolean, parseEnum, parseList, parseString } from "../../utils";

import type { DependencyListQueryParams } from "./types";

export function parseParams(
  params: DependencyListQueryParams,
): Urls.DependencyListParams {
  return {
    query: parseString(params.query),
    groupTypes: parseList(params.groupTypes, (item) =>
      parseEnum(item, DEPENDENCY_GROUP_TYPES),
    ),
    includePersonalCollections: parseBoolean(params.includePersonalCollections),
  };
}
