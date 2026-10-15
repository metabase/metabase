import type {
  QueryParam,
  UrlStateConfig,
} from "metabase/common/hooks/use-url-state";
import {
  getFirstParamValue,
  parsePage,
  parseQuery,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import { parseTimePreset } from "metabase/monitor/time-presets";
import {
  OAUTH_CLIENT_STATUSES,
  type OAuthClient,
  type OAuthClientListParams,
  type RevokeOAuthClientsRequest,
  type UserId,
} from "metabase-types/api";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_TAB,
  TAB_SORT_COLUMNS,
} from "./constants";
import type { OAuthClientsTab, OAuthClientsUrlState } from "./types";

const isTab = (value: string): value is OAuthClientsTab =>
  OAUTH_CLIENT_STATUSES.some((status) => status === value);

const parseTab = (param: QueryParam): OAuthClientsTab => {
  const value = getFirstParamValue(param);
  return typeof value === "string" && isTab(value) ? value : DEFAULT_TAB;
};

const parseUserId = (param: QueryParam): UserId | null => {
  const value = getFirstParamValue(param);
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const urlStateConfig: UrlStateConfig<OAuthClientsUrlState> = {
  parse: (query) => {
    const tab = parseTab(query.tab);
    return {
      page: parsePage(query.page),
      query: parseQuery(query.query),
      tab,
      registered: parseTimePreset(query.registered),
      user: parseUserId(query.user),
      last_used: parseTimePreset(query.last_used),
      sort_column: parseSortColumn(
        query.sort_column,
        TAB_SORT_COLUMNS[tab],
        DEFAULT_SORT_COLUMN,
      ),
      sort_direction: parseSortDirection(
        query.sort_direction,
        DEFAULT_SORT_DIRECTION,
      ),
    };
  },
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    query: state.query || undefined,
    tab: state.tab === DEFAULT_TAB ? undefined : state.tab,
    registered: state.registered ?? undefined,
    user: state.user === null ? undefined : String(state.user),
    last_used: state.last_used ?? undefined,
    sort_column:
      state.sort_column === DEFAULT_SORT_COLUMN ? undefined : state.sort_column,
    sort_direction:
      state.sort_direction === DEFAULT_SORT_DIRECTION
        ? undefined
        : state.sort_direction,
  }),
};

type PresetCutoffs = {
  registeredAfter: string | undefined;
  lastUsedAfter: string | undefined;
};

export const buildListParams = (
  state: OAuthClientsUrlState,
  pageSize: number,
  { registeredAfter, lastUsedAfter }: PresetCutoffs,
): OAuthClientListParams => ({
  limit: pageSize,
  offset: state.page * pageSize,
  status: state.tab,
  query: state.query || undefined,
  // a revoked client has no live tokens, so neither token filter could match on the Revoked tab
  "user-id": state.tab === "revoked" ? undefined : (state.user ?? undefined),
  "last-used-after": state.tab === "revoked" ? undefined : lastUsedAfter,
  "registered-after": registeredAfter,
  "sort-column": state.sort_column,
  "sort-direction": state.sort_direction,
});

// Any criterion but `ids` is about who holds the client's tokens, which the row doesn't carry, so it counts as a hit
export const isOAuthClientRevokedBy = (
  client: OAuthClient,
  request: RevokeOAuthClientsRequest,
): boolean =>
  client.status === "active" &&
  (request.ids === undefined || request.ids.includes(client.client_id));
