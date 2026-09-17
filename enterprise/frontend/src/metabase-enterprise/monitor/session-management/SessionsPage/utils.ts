import type {
  QueryParam,
  UrlStateConfig,
} from "metabase/common/hooks/use-url-state";
import {
  getAllParamValues,
  getFirstParamValue,
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import { dayjs } from "metabase/dayjs";
import type {
  AdminSessionEndReason,
  AdminSessionListParams,
  AdminSessionProvider,
} from "metabase-types/api";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_TAB,
  END_REASON_VALUES,
  PROVIDER_VALUES,
  SORT_COLUMN_VALUES,
  TAB_STATUS,
  TAB_VALUES,
  TIME_PRESET_VALUES,
} from "./constants";
import type {
  SessionsTab,
  SessionsTimePreset,
  SessionsUrlState,
} from "./types";

const parseQuery = (param: QueryParam): string => {
  const value = getFirstParamValue(param);
  return typeof value === "string" ? value.trim() : "";
};

const isProvider = (value: string): value is AdminSessionProvider =>
  PROVIDER_VALUES.some((provider) => provider === value);

// An unrecognised provider in the URL is dropped rather than sent on: the endpoint's enum would reject the whole
// request, taking the rest of the filters down with it.
const parseProviders = (param: QueryParam): AdminSessionProvider[] =>
  getAllParamValues(param).filter(isProvider);

export const isTab = (value: string): value is SessionsTab =>
  TAB_VALUES.some((tab) => tab === value);

const parseTab = (param: QueryParam): SessionsTab => {
  const value = getFirstParamValue(param);
  return typeof value === "string" && isTab(value) ? value : DEFAULT_TAB;
};

export const isTimePreset = (value: string): value is SessionsTimePreset =>
  TIME_PRESET_VALUES.some((preset) => preset === value);

const parseTimePreset = (param: QueryParam): SessionsTimePreset | null => {
  const value = getFirstParamValue(param);
  return typeof value === "string" && isTimePreset(value) ? value : null;
};

export const isEndReason = (value: string): value is AdminSessionEndReason =>
  END_REASON_VALUES.some((reason) => reason === value);

const parseEndReason = (param: QueryParam): AdminSessionEndReason | null => {
  const value = getFirstParamValue(param);
  return typeof value === "string" && isEndReason(value) ? value : null;
};

export const urlStateConfig: UrlStateConfig<SessionsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    query: parseQuery(query.query),
    tab: parseTab(query.tab),
    provider: parseProviders(query.provider),
    last_active: parseTimePreset(query.last_active),
    ended: parseTimePreset(query.ended),
    reason: parseEndReason(query.reason),
    sort_column: parseSortColumn(
      query.sort_column,
      SORT_COLUMN_VALUES,
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
    provider: state.provider.length === 0 ? undefined : state.provider,
    last_active: state.last_active ?? undefined,
    ended: state.ended ?? undefined,
    reason: state.reason ?? undefined,
    sort_column:
      state.sort_column === DEFAULT_SORT_COLUMN ? undefined : state.sort_column,
    sort_direction:
      state.sort_direction === DEFAULT_SORT_DIRECTION
        ? undefined
        : state.sort_direction,
  }),
};

export const getTimePresetCutoff = (
  preset: SessionsTimePreset | null,
): string | undefined =>
  preset === null ? undefined : dayjs().subtract(1, preset).toISOString();

export const buildListParams = (
  state: SessionsUrlState,
  pageSize: number,
  lastActiveAfter: string | undefined,
  endedAfter: string | undefined,
): AdminSessionListParams => {
  // The ended-only criteria never match a live session, so each tab sends only the filters it shows
  const isEnded = state.tab === "ended";
  return {
    limit: pageSize,
    offset: state.page * pageSize,
    // the endpoint rejects a blank query, so send it only when there is something to search for
    query: state.query || undefined,
    status: TAB_STATUS[state.tab],
    // an empty list would be sent as no filter at all, which is what we want; a populated one filters on any of them
    provider: state.provider.length === 0 ? undefined : state.provider,
    "last-active-after": isEnded ? undefined : lastActiveAfter,
    "ended-after": isEnded ? endedAfter : undefined,
    reason: isEnded ? (state.reason ?? undefined) : undefined,
    "sort-column": state.sort_column,
    "sort-direction": state.sort_direction,
  };
};
