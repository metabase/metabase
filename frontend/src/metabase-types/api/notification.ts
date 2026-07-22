import type { SortDirection } from "metabase-types/api/sorting";

import type { Card, CardId } from "./card";
import type { Channel, SlackChannelId } from "./notification-channels";
import type { PaginationRequest } from "./pagination";
import type { ScheduleDisplayType } from "./settings";
import type { UserId, UserInfo } from "./user";

export type NotificationId = number;

export type NotificationCardSendCondition =
  | "goal_above"
  | "goal_below"
  | "has_result";

type NotificationCardPayload = {
  card_id: CardId;
  card?: Card; // hydrated on the BE
  send_once: boolean;
  send_condition: NotificationCardSendCondition;

  id?: number;
  created_at?: string;
  updated_at?: string;
};

type NotificationCardData = {
  payload_type: "notification/card";
  // payload can be null when it's deleted from the database
  payload: NotificationCardPayload | null;
  payload_id?: number;
};

type NotificationData = NotificationCardData; // will be populated with more variants later on

export type NotificationRecipientUser = {
  type: "notification-recipient/user";
  user_id: number;
  permissions_group_id?: number | null;

  details: null;

  id?: number;
  notification_handler_id?: number;
  user?: UserInfo;
  created_at?: string;
  updated_at?: string;
};

export type NotificationRecipientRawValue = {
  type: "notification-recipient/raw-value";
  details: {
    value: string;
    channel_id?: SlackChannelId;
  };

  id?: number;
  created_at?: string;
  updated_at?: string;
};

export type NotificationRecipientGroup = {
  type: "notification-recipient/group";
  permissions_group_id: number;

  id?: number;
  created_at?: string;
  updated_at?: string;
};

export type NotificationRecipient =
  | NotificationRecipientUser
  | NotificationRecipientRawValue
  | NotificationRecipientGroup;

type NotificationHandlerBase = {
  notification_id?: NotificationId;
  template_id?: number | null;
  channel_id?: number | null;
  channel?: Channel | null;
  template?: unknown | null; // TODO: hydrated template
  active?: boolean;

  id?: number;
  created_at?: string;
  updated_at?: string;
};

export type NotificationChannelType =
  | "channel/email"
  | "channel/slack"
  | "channel/http";

export type NotificationHandlerEmail = {
  channel_type: "channel/email";
  recipients: NotificationRecipient[];
} & NotificationHandlerBase;

export type NotificationHandlerSlack = {
  channel_type: "channel/slack";
  recipients: NotificationRecipientRawValue[];
} & NotificationHandlerBase;

export type NotificationHandlerHttp = {
  channel_id: number;
  channel_type: "channel/http";
  recipients: NotificationRecipient[];
} & NotificationHandlerBase;

export type NotificationHandler =
  | NotificationHandlerEmail
  | NotificationHandlerSlack
  | NotificationHandlerHttp;

export type NotificationCronSubscription = {
  type: "notification-subscription/cron";
  event_name: null;
  cron_schedule: string;
  ui_display_type: ScheduleDisplayType;

  // only for existing notifications
  id?: number;
  notification_id?: number;
  created_at?: string;
  updated_at?: string;
};

export interface ListNotificationsRequest extends PaginationRequest {
  include_inactive?: boolean;
  creator_id?: UserId;
  recipient_id?: UserId;
  creator_or_recipient_id?: UserId;
  card_id?: CardId;
  permission_group_id?: number;
}

export type CreateAlertNotificationRequest = NotificationCardData & {
  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];
};

export type CreateNotificationRequest = CreateAlertNotificationRequest; // will be populated with more variants later on

export type UpdateAlertNotificationRequest = NotificationCardData & {
  id: NotificationId;
  active: boolean;
  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];
  creator_id?: UserId;
};

export type UpdateNotificationRequest = UpdateAlertNotificationRequest; // will be populated with more variants later on

export type Notification = NotificationData & {
  id: NotificationId;
  active: boolean;

  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];

  creator_id: UserId;
  creator: UserInfo;

  updated_at?: string;
  created_at?: string;
};

export type NotificationRunStatus = "failing" | "successful";

export type NotificationRunSummary = {
  at: string;
  error: string | null;
  status: NotificationRunStatus;
};

export type NotificationChannelSendEntry = {
  channel_type: NotificationChannelType;
  status: NotificationRunStatus;
  error: string | null;
};

export type NotificationTickSendEntry = {
  at: string;
  status: NotificationRunStatus;
  error: string | null;
  channels: NotificationChannelSendEntry[];
};

export type AdminNotificationSortColumn =
  | "id"
  | "last_send"
  | "last_check"
  | "card_name"
  | "creator_name"
  | "updated_at";

// Admin notifications carry a nullable creator: the row may have no creator, or
// a deactivated one (the "Ownerless" tab). The UI labels the creator as "Owner".
export type AdminNotification = Omit<Notification, "creator_id" | "creator"> & {
  creator_id: UserId | null;
  creator: UserInfo | null;
  last_check: NotificationRunSummary | null;
  last_send: NotificationRunSummary | null;
};

export type AdminNotificationDetail = AdminNotification & {
  check_history: NotificationRunSummary[];
  send_history: NotificationTickSendEntry[];
};

export type AdminNotificationListParams = {
  limit?: number;
  offset?: number;
  active?: boolean;
  creator_id?: UserId;
  creator_active?: boolean;
  creatorless?: boolean;
  card_id?: CardId;
  recipient_email?: string;
  channel?: NotificationChannelType | NotificationChannelType[];
  last_send_status?: NotificationRunStatus;
  last_check_status?: NotificationRunStatus;
  query?: string;
  sort_column?: AdminNotificationSortColumn;
  sort_direction?: SortDirection;
};

export type AdminNotificationListResponse = {
  data: AdminNotification[];
  total: number;
  limit: number | null;
  offset: number | null;
};

export type BulkNotificationAction = "archive" | "change-creator";

export type BulkNotificationPayload = {
  notification_ids: NotificationId[];
  action: BulkNotificationAction;
  creator_id?: UserId;
};

// Unauthenticated, hash-based email unsubscribe (pulse subscriptions and
// notifications). The two endpoints accept mutually-exclusive id keys, so both
// are optional here.
export type UnsubscribeRequest = {
  hash: string;
  email: string;
  "pulse-id"?: string;
  "notification-handler-id"?: string;
};

export type UnsubscribeResponse = {
  status?: string;
  title: string;
};
