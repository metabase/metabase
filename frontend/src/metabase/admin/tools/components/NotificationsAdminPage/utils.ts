import { t } from "ttag";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { BadgeProps } from "metabase/ui";
import type {
  AdminNotificationListParams,
  AdminNotificationSortColumn,
  AdminNotificationSortDirection,
  CardId,
  NotificationChannelType,
  NotificationStatus,
  UserId,
} from "metabase-types/api";

type StatusBadgeColor = NonNullable<BadgeProps["color"]>;

export type NotificationsUrlState = {
  page: number;
  active: boolean | null;
  status: NotificationStatus | null;
  creator_id: UserId | null;
  card_id: CardId | null;
  recipient_email: string;
  channel: NotificationChannelType | null;
  sort_column: AdminNotificationSortColumn;
  sort_direction: AdminNotificationSortDirection;
};

export const DEFAULT_ACTIVE: boolean | null = true;
export const DEFAULT_SORT_COLUMN: AdminNotificationSortColumn = "updated_at";
export const DEFAULT_SORT_DIRECTION: AdminNotificationSortDirection = "desc";

const STATUS_VALUES = [
  "healthy",
  "orphaned_card",
  "orphaned_creator",
  "failing",
  "abandoned",
] as const satisfies readonly NotificationStatus[];

const CHANNEL_VALUES = [
  "channel/email",
  "channel/slack",
  "channel/http",
] as const satisfies readonly NotificationChannelType[];

const SORT_COLUMN_VALUES = [
  "last_sent_at",
  "card_name",
  "creator_name",
  "updated_at",
] as const satisfies readonly AdminNotificationSortColumn[];

const SORT_DIRECTION_VALUES = [
  "asc",
  "desc",
] as const satisfies readonly AdminNotificationSortDirection[];

function parsePage(param: QueryParam): number {
  const value = getFirstParamValue(param);
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseActive(param: QueryParam): boolean | null {
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
}

function parseStatus(param: QueryParam): NotificationStatus | null {
  const value = getFirstParamValue(param);
  return value && (STATUS_VALUES as readonly string[]).includes(value)
    ? (value as NotificationStatus)
    : null;
}

function parseChannel(param: QueryParam): NotificationChannelType | null {
  const value = getFirstParamValue(param);
  return value && (CHANNEL_VALUES as readonly string[]).includes(value)
    ? (value as NotificationChannelType)
    : null;
}

function parseId(param: QueryParam): number | null {
  const value = getFirstParamValue(param);
  if (!value) {
    return null;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseEmail(param: QueryParam): string {
  const value = getFirstParamValue(param);
  return typeof value === "string" ? value.trim() : "";
}

function parseSortColumn(param: QueryParam): AdminNotificationSortColumn {
  const value = getFirstParamValue(param);
  return value && (SORT_COLUMN_VALUES as readonly string[]).includes(value)
    ? (value as AdminNotificationSortColumn)
    : DEFAULT_SORT_COLUMN;
}

function parseSortDirection(param: QueryParam): AdminNotificationSortDirection {
  const value = getFirstParamValue(param);
  return value && (SORT_DIRECTION_VALUES as readonly string[]).includes(value)
    ? (value as AdminNotificationSortDirection)
    : DEFAULT_SORT_DIRECTION;
}

export const urlStateConfig: UrlStateConfig<NotificationsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    active: parseActive(query.active),
    status: parseStatus(query.status),
    creator_id: parseId(query.creator_id),
    card_id: parseId(query.card_id),
    recipient_email: parseEmail(query.recipient_email),
    channel: parseChannel(query.channel),
    sort_column: parseSortColumn(query.sort_column),
    sort_direction: parseSortDirection(query.sort_direction),
  }),
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    active:
      state.active === DEFAULT_ACTIVE
        ? undefined
        : state.active === null
          ? "all"
          : String(state.active),
    status: state.status ?? undefined,
    creator_id: state.creator_id == null ? undefined : String(state.creator_id),
    card_id: state.card_id == null ? undefined : String(state.card_id),
    recipient_email: state.recipient_email || undefined,
    channel: state.channel ?? undefined,
    sort_column:
      state.sort_column === DEFAULT_SORT_COLUMN ? undefined : state.sort_column,
    sort_direction:
      state.sort_direction === DEFAULT_SORT_DIRECTION
        ? undefined
        : state.sort_direction,
  }),
};

export function buildListParams(
  state: NotificationsUrlState,
  pageSize: number,
): AdminNotificationListParams {
  return {
    limit: pageSize,
    offset: state.page * pageSize,
    active: state.active ?? undefined,
    status: state.status ?? undefined,
    creator_id: state.creator_id ?? undefined,
    card_id: state.card_id ?? undefined,
    recipient_email: state.recipient_email || undefined,
    channel: state.channel ?? undefined,
    sort_column: state.sort_column,
    sort_direction: state.sort_direction,
  };
}

export function getStatusLabel(status: NotificationStatus): string {
  switch (status) {
    case "healthy":
      return t`Healthy`;
    case "orphaned_card":
      return t`Orphaned`;
    case "orphaned_creator":
      return t`No owner`;
    case "failing":
      return t`Failing`;
    case "abandoned":
      return t`Abandoned`;
  }
}

export function getStatusColor(status: NotificationStatus): StatusBadgeColor {
  switch (status) {
    case "healthy":
      return "success";
    case "failing":
    case "abandoned":
      return "error";
    case "orphaned_card":
    case "orphaned_creator":
      return "warning";
  }
}

export function getChannelLabel(channel: NotificationChannelType): string {
  switch (channel) {
    case "channel/email":
      return t`Email`;
    case "channel/slack":
      return t`Slack`;
    case "channel/http":
      return t`Webhook`;
  }
}

export function getChannelIconName(
  channel: NotificationChannelType,
): "mail" | "slack" | "webhook" {
  switch (channel) {
    case "channel/email":
      return "mail";
    case "channel/slack":
      return "slack";
    case "channel/http":
      return "webhook";
  }
}
