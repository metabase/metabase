import type {
  QueryParam,
  UrlStateConfig,
} from "metabase/common/hooks/use-url-state";
import {
  getFirstParamValue,
  parsePage,
} from "metabase/common/hooks/use-url-state";
import {
  OAUTH_CLIENT_STATUSES,
  type OAuthClientListParams,
} from "metabase-types/api";

import { DEFAULT_TAB } from "./constants";
import type { OAuthClientsTab, OAuthClientsUrlState } from "./types";

export const isTab = (value: string): value is OAuthClientsTab =>
  OAUTH_CLIENT_STATUSES.some((status) => status === value);

const parseTab = (param: QueryParam): OAuthClientsTab => {
  const value = getFirstParamValue(param);
  return typeof value === "string" && isTab(value) ? value : DEFAULT_TAB;
};

export const urlStateConfig: UrlStateConfig<OAuthClientsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    tab: parseTab(query.tab),
  }),
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    tab: state.tab === DEFAULT_TAB ? undefined : state.tab,
  }),
};

export const buildListParams = (
  state: OAuthClientsUrlState,
  pageSize: number,
): OAuthClientListParams => ({
  limit: pageSize,
  offset: state.page * pageSize,
  // a tab is a status, so the list asks for exactly what the tab shows
  status: state.tab,
});
