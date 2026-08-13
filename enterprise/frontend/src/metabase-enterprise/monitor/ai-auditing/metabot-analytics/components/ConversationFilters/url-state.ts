import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";

import { DEFAULT_DATE } from "./useFilterOptions";

export type FilterUrlState = {
  date: string | null;
  user: string | null;
  group: string | null;
  tenant: string | null;
};

function parseString(param: QueryParam): string | null {
  const value = getFirstParamValue(param);
  return value && value.trim().length > 0 ? value.trim() : null;
}

export const filterUrlStateConfig: UrlStateConfig<FilterUrlState> = {
  parse: (query) => ({
    date: parseString(query.date) ?? DEFAULT_DATE,
    user: parseString(query.user),
    group: parseString(query.group),
    tenant: parseString(query.tenant),
  }),
  serialize: ({ date, user, group, tenant }) => ({
    date: date === DEFAULT_DATE ? undefined : (date ?? undefined),
    user: user ?? undefined,
    group: group ?? undefined,
    tenant: tenant ?? undefined,
  }),
};

export function mergeUrlStateConfig<
  F extends Record<string, unknown>,
  P extends Record<string, unknown>,
>(
  filterCfg: UrlStateConfig<F>,
  pageCfg: UrlStateConfig<P>,
): UrlStateConfig<F & P> {
  return {
    parse: (query) => ({
      ...filterCfg.parse(query),
      ...pageCfg.parse(query),
    }),
    serialize: (state) => ({
      ...filterCfg.serialize(state),
      ...pageCfg.serialize(state),
    }),
  };
}
