import dayjs from "dayjs";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { IconName } from "metabase/ui";
import {
  type AdminNotificationListParams,
  type AdminNotificationSortColumn,
  type NotificationChannelType,
  type NotificationRunStatus,
  type SortDirection,
  guardSortDirection,
} from "metabase-types/api";

export type NotificationsTab = "all" | "failing" | "ownerless";

export type NotificationsUrlState = {
  page: number;
  active: boolean | null;
  query: string;
  channel: NotificationChannelType | null;
  last_sent_status: NotificationRunStatus | null;
  owner_active: boolean | null;
  recipient_email: string;
  tab: NotificationsTab;
  sort_column: AdminNotificationSortColumn;
  sort_direction: SortDirection;
};

export const DEFAULT_TAB: NotificationsTab = "all";

export const DEFAULT_ACTIVE: boolean | null = true;
export const DEFAULT_SORT_COLUMN: AdminNotificationSortColumn = "updated_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: AdminNotificationSortColumn[] = [
  "last_sent",
  "card_name",
  "owner_name",
  "updated_at",
];

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
  valueToParse && guardFn(valueToParse) ? valueToParse : defaultValue;

const guardChannel = (value: string): value is NotificationChannelType =>
  (
    [
      "channel/email",
      "channel/slack",
      "channel/http",
    ] satisfies NotificationChannelType[]
  ).includes(value as NotificationChannelType);

const parseChannelEnum = (
  param: QueryParam,
): NotificationsUrlState["channel"] =>
  parseGuardedEnum(getFirstParamValue(param), guardChannel, null);

const guardLastSentStatus = (value: string): value is NotificationRunStatus =>
  (["failing", "successful"] satisfies NotificationRunStatus[]).includes(
    value as NotificationRunStatus,
  );

const parseLastSentStatusEnum = (
  param: QueryParam,
): NotificationsUrlState["last_sent_status"] =>
  parseGuardedEnum(getFirstParamValue(param), guardLastSentStatus, null);

const parseOwnerActive = (param: QueryParam): boolean | null => {
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
  (["all", "failing", "ownerless"] satisfies NotificationsTab[]).includes(
    value as NotificationsTab,
  );

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
    channel: parseChannelEnum(query.channel),
    last_sent_status: parseLastSentStatusEnum(query.last_sent_status),
    owner_active: parseOwnerActive(query.owner_active),
    recipient_email: parseRecipientEmail(query.recipient_email),
    tab: parseTabEnum(query.tab),
    sort_column: parseSortColumnEnum(query.sort_column),
    sort_direction: parseSortDirectionEnum(query.sort_direction),
  }),
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    active: serializeActive(state.active),
    query: state.query || undefined,
    channel: state.channel ?? undefined,
    last_sent_status: state.last_sent_status ?? undefined,
    owner_active:
      state.owner_active == null ? undefined : String(state.owner_active),
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

type TabFilters = {
  last_sent_status: NotificationRunStatus | null;
  owner_active: boolean | null;
};

const TAB_FILTERS: Record<NotificationsTab, TabFilters> = {
  all: { last_sent_status: null, owner_active: null },
  failing: { last_sent_status: "failing", owner_active: null },
  ownerless: { last_sent_status: null, owner_active: false },
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
    channel: state.channel ?? undefined,
    last_sent_status:
      tabFilters.last_sent_status ?? state.last_sent_status ?? undefined,
    owner_active: tabFilters.owner_active ?? state.owner_active ?? undefined,
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
