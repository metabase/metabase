import type * as Urls from "metabase/lib/urls";
import { DEPENDENCY_GROUP_TYPES } from "metabase-types/api";

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
  return {
    page: parseNumber(params.page),
    query: parseString(params.query),
    groupTypes: parseList(params.groupTypes, (item) =>
      parseEnum(item, DEPENDENCY_GROUP_TYPES),
    ),
    includePersonalCollections: parseBoolean(params.includePersonalCollections),
  };
}
