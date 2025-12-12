import type * as Urls from "metabase/lib/urls";
import { DEPENDENCY_GROUP_TYPES } from "metabase-types/api";

import { parseEnum, parseList, parseNumber, parseString } from "../../utils";

import type { BrokenDependencyListRawParams } from "./types";

export function parseRawParams(
  rawParams?: BrokenDependencyListRawParams,
): Urls.BrokenDependencyListParams {
  return {
    query: parseString(rawParams?.query),
    page: parseNumber(rawParams?.page),
    types: parseList(rawParams?.types, (value) =>
      parseEnum(value, DEPENDENCY_GROUP_TYPES),
    ),
  };
}
