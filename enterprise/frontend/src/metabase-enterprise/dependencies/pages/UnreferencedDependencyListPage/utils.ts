import type * as Urls from "metabase/lib/urls";
import { DEPENDENCY_GROUP_TYPES } from "metabase-types/api";

import { parseEnum, parseList, parseNumber, parseString } from "../../utils";

import type { UnreferencedDependencyListRawParams } from "./types";

export function parseRawParams(
  rawParams?: UnreferencedDependencyListRawParams,
): Urls.UnreferencedDependencyListParams {
  return {
    query: parseString(rawParams?.query),
    types: parseList(rawParams?.types, (value) =>
      parseEnum(value, DEPENDENCY_GROUP_TYPES),
    ),
    pageIndex: parseNumber(rawParams?.pageIndex),
  };
}
