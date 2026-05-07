import type { MantineColor } from "@mantine/core/lib/core/MantineProvider";
import dayjs from "dayjs";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { BadgeProps, IconName } from "metabase/ui";
import {
  type AdminNotificationListParams,
  type AdminNotificationSortColumn,
  type CardId,
  type NotificationChannelType,
  type NotificationStatus,
  type SortDirection,
  type UserId,
  guardSortDirection,
} from "metabase-types/api";

type StatusBadgeColor = NonNullable<BadgeProps["color"]>;

export type NotificationsUrlState = {
  page: number;
  active: boolean | null;
  status: NotificationStatus | null;
  creator_id: UserId | null;
  card_id: CardId | null;
  query: string;
  channel: NotificationChannelType | null;
  sort_column: AdminNotificationSortColumn;
  sort_direction: SortDirection;
};

export const DEFAULT_ACTIVE: boolean | null = true;
export const DEFAULT_SORT_COLUMN: AdminNotificationSortColumn = "updated_at";
export const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

export const SORT_COLUMN_VALUES: AdminNotificationSortColumn[] = [
  "last_sent_at",
  "card_name",
  "creator_name",
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

const parseId = (param: QueryParam): number | null => {
  const value = getFirstParamValue(param);
  if (!value) {
    return null;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseQuery = (param: QueryParam): string => {
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

const guardAdminNotificationStatus = (
  value: string,
): value is NotificationStatus =>
  (
    [
      "healthy",
      "orphaned_card",
      "orphaned_creator",
      "failing",
      "abandoned",
    ] satisfies NotificationStatus[]
  ).includes(value as NotificationStatus);

const parseStatusEnum = (param: QueryParam): NotificationsUrlState["status"] =>
  parseGuardedEnum(
    getFirstParamValue(param),
    guardAdminNotificationStatus,
    null,
  );

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
    status: parseStatusEnum(query.status),
    creator_id: parseId(query.creator_id),
    card_id: parseId(query.card_id),
    query: parseQuery(query.query),
    channel: parseChannelEnum(query.channel),
    sort_column: parseSortColumnEnum(query.sort_column),
    sort_direction: parseSortDirectionEnum(query.sort_direction),
  }),
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    active: serializeActive(state.active),
    status: state.status ?? undefined,
    creator_id: state.creator_id == null ? undefined : String(state.creator_id),
    card_id: state.card_id == null ? undefined : String(state.card_id),
    query: state.query || undefined,
    channel: state.channel ?? undefined,
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
): AdminNotificationListParams => ({
  limit: pageSize,
  offset: state.page * pageSize,
  active: state.active ?? undefined,
  status: state.status ?? undefined,
  creator_id: state.creator_id ?? undefined,
  card_id: state.card_id ?? undefined,
  query: state.query || undefined,
  channel: state.channel ?? undefined,
  sort_column: state.sort_column,
  sort_direction: state.sort_direction,
});

export const getStatusLabel = (status: NotificationStatus): string =>
  match(status)
    .with("healthy", () => t`Healthy`)
    .with("orphaned_card", () => t`Orphaned`)
    .with("orphaned_creator", () => t`Deactivated owner`)
    .with("failing", () => t`Failing`)
    .with("abandoned", () => t`Abandoned`)
    .exhaustive();

export const getStatusColor = (status: NotificationStatus): StatusBadgeColor =>
  match(status)
    .returnType<StatusBadgeColor>()
    .with("healthy", () => "success")
    .with("failing", "abandoned", () => "error")
    .with("orphaned_card", "orphaned_creator", () => "warning")
    .exhaustive();

export const getStatusBackground = (status: NotificationStatus): MantineColor =>
  match(status)
    .with("healthy", () => "background-primary" as const)
    .with(
      "orphaned_card",
      "orphaned_creator",
      () => "background-warning" as const,
    )
    .with("failing", "abandoned", () => "background-error" as const)
    .exhaustive();

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

type StatusIcon = { name: IconName; color: MantineColor };

export const getStatusIcon = (status: NotificationStatus): StatusIcon =>
  match<NotificationStatus, StatusIcon>(status)
    .with("healthy", () => ({ name: "verified", color: "success" }))
    .with("orphaned_creator", () => ({ name: "verified", color: "success" }))
    .with("orphaned_card", () => ({ name: "warning", color: "warning" }))
    .with("failing", "abandoned", () => ({
      name: "warning_round",
      color: "error",
    }))
    .exhaustive();

export type NotificationStatusTab = "all" | "failing" | "orphaned_creator";

export const getStatusFromTab = (
  tab: NotificationStatusTab,
): NotificationStatus | null =>
  match(tab)
    .with("all", () => null)
    .with("failing", () => "failing" as const)
    .with("orphaned_creator", () => "orphaned_creator" as const)
    .exhaustive();

export const getTabFromStatus = (
  status: NotificationStatus | null,
): NotificationStatusTab =>
  match(status)
    .with("failing", () => "failing" as const)
    .with("orphaned_creator", () => "orphaned_creator" as const)
    .otherwise(() => "all" as const);

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
