import { t } from "ttag";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { BadgeProps } from "metabase/ui";
import type {
  AdminNotificationListParams,
  CardId,
  NotificationChannelType,
  NotificationHealth,
  UserId,
} from "metabase-types/api";

type HealthBadgeColor = NonNullable<BadgeProps["color"]>;

export type NotificationStatusFilter = "active" | "archived" | "all";

export const DEFAULT_STATUS: NotificationStatusFilter = "active";

export type NotificationsUrlState = {
  page: number;
  status: NotificationStatusFilter;
  health: NotificationHealth | null;
  creator_id: UserId | null;
  card_id: CardId | null;
  recipient_email: string;
  channel: NotificationChannelType | null;
};

const HEALTH_VALUES: readonly NotificationHealth[] = [
  "healthy",
  "orphaned_card",
  "orphaned_creator",
  "failing",
];

const CHANNEL_VALUES: readonly NotificationChannelType[] = [
  "channel/email",
  "channel/slack",
  "channel/http",
];

const STATUS_VALUES: readonly NotificationStatusFilter[] = [
  "active",
  "archived",
  "all",
];

function parsePage(param: QueryParam): number {
  const value = getFirstParamValue(param);
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseStatus(param: QueryParam): NotificationStatusFilter {
  const value = getFirstParamValue(param);
  return value && (STATUS_VALUES as readonly string[]).includes(value)
    ? (value as NotificationStatusFilter)
    : DEFAULT_STATUS;
}

function parseHealth(param: QueryParam): NotificationHealth | null {
  const value = getFirstParamValue(param);
  return value && (HEALTH_VALUES as readonly string[]).includes(value)
    ? (value as NotificationHealth)
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

export const urlStateConfig: UrlStateConfig<NotificationsUrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    status: parseStatus(query.status),
    health: parseHealth(query.health),
    creator_id: parseId(query.creator_id),
    card_id: parseId(query.card_id),
    recipient_email: parseEmail(query.recipient_email),
    channel: parseChannel(query.channel),
  }),
  serialize: (state) => ({
    page: state.page === 0 ? undefined : String(state.page),
    status: state.status === DEFAULT_STATUS ? undefined : state.status,
    health: state.health ?? undefined,
    creator_id: state.creator_id == null ? undefined : String(state.creator_id),
    card_id: state.card_id == null ? undefined : String(state.card_id),
    recipient_email: state.recipient_email || undefined,
    channel: state.channel ?? undefined,
  }),
};

export function buildListParams(
  state: NotificationsUrlState,
  pageSize: number,
): AdminNotificationListParams {
  return {
    limit: pageSize,
    offset: state.page * pageSize,
    status: state.status,
    health: state.health ?? undefined,
    creator_id: state.creator_id ?? undefined,
    card_id: state.card_id ?? undefined,
    recipient_email: state.recipient_email || undefined,
    channel: state.channel ?? undefined,
  };
}

export function getHealthLabel(health: NotificationHealth): string {
  switch (health) {
    case "healthy":
      return t`Healthy`;
    case "orphaned_card":
      return t`Orphaned card`;
    case "orphaned_creator":
      return t`Deactivated creator`;
    case "failing":
      return t`Failing`;
    case "abandoned":
      return t`Abandoned`;
  }
}

export function getHealthColor(health: NotificationHealth): HealthBadgeColor {
  switch (health) {
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
