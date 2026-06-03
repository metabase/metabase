import dayjs from "dayjs";
import { match } from "ts-pattern";
import { t } from "ttag";

import type {
  QueryParam,
  UrlStateConfig,
} from "metabase/common/hooks/use-url-state";
import {
  getAllParamValues,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type {
  AdminNotificationListParams,
  AdminNotificationSortColumn,
  IconName,
  NotificationChannelType,
  NotificationRunStatus,
} from "metabase-types/api";
import { guardSortDirection } from "metabase-types/api";

import {
  CHANNEL_VALUES,
  DEFAULT_ACTIVE,
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_TAB,
  LAST_SEND_STATUS_VALUES,
  SORT_COLUMN_VALUES,
  TAB_FILTERS,
  TAB_VALUES,
} from "./constants";
import type { NotificationsTab, NotificationsUrlState } from "./types";

const parsePage = (param: QueryParam): number => {
  const value = getFirstParamValue(param);
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const parseActive = (param: QueryParam): boolean | null => {
  const value = getFirstParamValue(param);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "all") {
    return null;
  }
  return DEFAULT_ACTIVE;
};

const parseQuery = (param: QueryParam): string => {
  const value = getFirstParamValue(param);
  return typeof value === "string" ? value.trim() : "";
};

const parseRecipientEmail = (param: QueryParam): string => {
  const value = getFirstParamValue(param);
  return typeof value === "string" ? value.trim() : "";
};

const serializeActive = (active: boolean | null): string | undefined => {
  if (active === DEFAULT_ACTIVE) {
    return undefined;
  }
  if (active === null) {
    return "all";
  }
  return String(active);
};

const parseGuardedEnum = <T extends string, D extends T | null>(
  valueToParse: string | null | undefined,
  guardFn: (value: string) => value is T,
  defaultValue: D,
): T | D =>
  valueToParse !== null && valueToParse !== undefined && guardFn(valueToParse)
    ? valueToParse
    : defaultValue;

const guardChannel = (value: string): value is NotificationChannelType =>
  (CHANNEL_VALUES satisfies NotificationChannelType[]).includes(
    value as NotificationChannelType,
  );

const parseChannels = (param: QueryParam): NotificationChannelType[] =>
  getAllParamValues(param).filter(guardChannel);

const guardLastSendStatus = (value: string): value is NotificationRunStatus =>
  (LAST_SEND_STATUS_VALUES satisfies NotificationRunStatus[]).includes(
    value as NotificationRunStatus,
  );

const parseLastSendStatusEnum = (
  param: QueryParam,
): NotificationsUrlState["last_send_status"] =>
  parseGuardedEnum(getFirstParamValue(param), guardLastSendStatus, null);

const parseCreatorActive = (param: QueryParam): boolean | null => {
  const value = getFirstParamValue(param);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
};

const guardTab = (value: string): value is NotificationsTab =>
  (TAB_VALUES satisfies NotificationsTab[]).includes(value as NotificationsTab);

const parseTabEnum = (param: QueryParam): NotificationsTab =>
  parseGuardedEnum(getFirstParamValue(param), guardTab, DEFAULT_TAB);

const guardSortColumn = (value: string): value is AdminNotificationSortColumn =>
  (SORT_COLUMN_VALUES satisfies AdminNotificationSortColumn[]).includes(
    value as AdminNotificationSortColumn,
  );

const parseSortColumnEnum = (
  param: QueryParam,
): NotificationsUrlState["sort_column"] =>
  parseGuardedEnum(
    getFirstParamValue(param),
    guardSortColumn,
    DEFAULT_SORT_COLUMN,
  );

const parseSortDirectionEnum = (
  param: QueryParam,
): NotificationsUrlState["sort_direction"] =>
  parseGuardedEnum(
    getFirstParamValue(param),
    guardSortDirection,
    DEFAULT_SORT_DIRECTION,
  );

export const urlStateConfig: UrlStateConfig<NotificationsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    active: parseActive(query.active),
    query: parseQuery(query.query),
    channel: parseChannels(query.channel),
    last_send_status: parseLastSendStatusEnum(query.last_send_status),
    creator_active: parseCreatorActive(query.creator_active),
    recipient_email: parseRecipientEmail(query.recipient_email),
    tab: parseTabEnum(query.tab),
    sort_column: parseSortColumnEnum(query.sort_column),
    sort_direction: parseSortDirectionEnum(query.sort_direction),
  }),
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    active: serializeActive(state.active),
    query: state.query || undefined,
    channel: state.channel.length === 0 ? undefined : state.channel,
    last_send_status: state.last_send_status ?? undefined,
    creator_active:
      state.creator_active === null ? undefined : String(state.creator_active),
    recipient_email: state.recipient_email || undefined,
    tab: state.tab === DEFAULT_TAB ? undefined : state.tab,
    sort_column:
      state.sort_column === DEFAULT_SORT_COLUMN ? undefined : state.sort_column,
    sort_direction:
      state.sort_direction === DEFAULT_SORT_DIRECTION
        ? undefined
        : state.sort_direction,
  }),
};

export const buildListParams = (
  state: NotificationsUrlState,
  pageSize: number,
): AdminNotificationListParams => {
  const tabFilters = TAB_FILTERS[state.tab];
  return {
    limit: pageSize,
    offset: state.page * pageSize,
    active: state.active ?? undefined,
    query: state.query || undefined,
    channel: state.channel.length === 0 ? undefined : state.channel,
    last_send_status: state.last_send_status ?? undefined,
    last_check_status: tabFilters.last_check_status ?? undefined,
    creatorless: tabFilters.creatorless,
    creator_active:
      state.tab === "ownerless"
        ? undefined
        : (state.creator_active ?? undefined),
    recipient_email: state.recipient_email || undefined,
    sort_column: state.sort_column,
    sort_direction: state.sort_direction,
  };
};

export const getChannelLabel = (channel: NotificationChannelType): string =>
  match(channel)
    .with("channel/email", () => t`Email`)
    .with("channel/slack", () => t`Slack`)
    .with("channel/http", () => t`Webhook`)
    .exhaustive();

export const getChannelIconName = (
  channel: NotificationChannelType,
): IconName =>
  match(channel)
    .with("channel/email", () => "mail" as const)
    .with("channel/slack", () => "slack" as const)
    .with("channel/http", () => "webhook" as const)
    .exhaustive();

export const formatRelativeDate = (
  value: string | null | undefined,
): string => {
  if (!value) {
    return t`Never`;
  }
  const date = dayjs(value);
  const now = dayjs();
  if (date.isSame(now, "day")) {
    return t`Today, ${date.format("LT")}`;
  }
  if (date.isSame(now.subtract(1, "day"), "day")) {
    return t`Yesterday, ${date.format("LT")}`;
  }
  return date.format("MMM D, LT");
};
