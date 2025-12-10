import type * as Urls from "metabase/lib/urls";
import type { DependencyListRawParams } from "metabase-enterprise/dependencies/types";
import {
  DEPENDENCY_GROUP_TYPES,
  DEPENDENCY_SORT_COLUMNS,
  DEPENDENCY_SORT_DIRECTIONS,
} from "metabase-types/api";

import { parseEnum, parseList, parseNumber, parseString } from "../../utils";

export function parseRawParams(
  rawParams?: DependencyListRawParams,
): Urls.DependencyListParams {
  return {
    query: parseString(rawParams?.query),
    page: parseNumber(rawParams?.page),
    types: parseList(rawParams?.types, (value) =>
      parseEnum(value, DEPENDENCY_GROUP_TYPES),
    ),
    sortColumn: parseEnum(rawParams?.sortColumn, DEPENDENCY_SORT_COLUMNS),
    sortDirection: parseEnum(
      rawParams?.sortDirection,
      DEPENDENCY_SORT_DIRECTIONS,
    ),
  };
}
