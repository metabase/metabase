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
  OAUTH_CLIENT_SORT_COLUMNS,
  OAUTH_CLIENT_STATUSES,
  type OAuthClientListParams,
  type UserId,
} from "metabase-types/api";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_TAB,
} from "./constants";
import type { OAuthClientsTab, OAuthClientsUrlState } from "./types";

export const isTab = (value: string): value is OAuthClientsTab =>
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
  parse: (query) => ({
    page: parsePage(query.page),
    query: parseQuery(query.query),
    tab: parseTab(query.tab),
    registered: parseTimePreset(query.registered),
    user: parseUserId(query.user),
    last_used: parseTimePreset(query.last_used),
    sort_column: parseSortColumn(
      query.sort_column,
      OAUTH_CLIENT_SORT_COLUMNS,
      DEFAULT_SORT_COLUMN,
    ),
    sort_direction: parseSortDirection(
      query.sort_direction,
      DEFAULT_SORT_DIRECTION,
    ),
  }),
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

/** The instants the relative presets in the URL resolve to, as the endpoint's `*-after` bounds. */
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
  // a tab is a status, so the list asks for exactly what the tab shows
  status: state.tab,
  // the endpoint rejects a blank query, so send it only when there is something to search for
  query: state.query || undefined,
  // `user-id` matches an unrevoked token and revoking a client stamps every token it held, so it could only ever
  // come back empty on the Revoked tab; each tab sends only the filters it offers, as the Sessions page does.
  // `registered-after` goes on both: a revoked client was registered at some point too.
  "user-id": state.tab === "revoked" ? undefined : (state.user ?? undefined),
  // `last-used-after` is Active-only for the same reason the column is: a revoked client's tokens no longer
  // resolve, so it cannot have been used since it went
  "last-used-after": state.tab === "revoked" ? undefined : lastUsedAfter,
  "registered-after": registeredAfter,
  "sort-column": state.sort_column,
  "sort-direction": state.sort_direction,
});
