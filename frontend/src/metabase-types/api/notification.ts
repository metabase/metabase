import type { Card, CardId } from "metabase-types/api/card";
import type { Channel } from "metabase-types/api/notification-channels";
import type { PaginationRequest } from "metabase-types/api/pagination";
import type { UserId, UserInfo } from "metabase-types/api/user";

export type NotificationId = number;

export type NotificationCardSendCondition =
  | "goal_above"
  | "goal_below"
  | "has_result";

//#region Payload union type
type NotificationCardPayload = {
  payload_type: "notification/card";
  payload: {
    card_id: CardId;
    card?: Card; // hydrated on the BE
    send_once: boolean;
    send_condition: NotificationCardSendCondition;

    id?: number;
    created_at?: string;
    updated_at?: string;
  };
  payload_id?: number;
};

type NotificationPayload = NotificationCardPayload; // will be populated with more variants later on

//#endregion

//#region Handler union type
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
  };

  id?: number;
  created_at?: string;
  updated_at?: string;
};

export type NotificationRecipient =
  | NotificationRecipientUser
  | NotificationRecipientRawValue;

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

//#endregion

//#region Subscription type
export type NotificationCronSubscription = {
  type: "notification-subscription/cron";
  event_name: null;
  cron_schedule: string;

  // only for existing notifications
  id?: number;
  notification_id?: number;
  created_at?: string;
  updated_at?: string;
};

//#endregion

export interface ListNotificationsRequest extends PaginationRequest {
  include_inactive?: boolean;
  creator_id?: UserId;
  recipient_id?: UserId;
  creator_or_recipient_id?: UserId;
  card_id?: CardId;
  permission_group_id?: number;
}

export type CreateAlertNotificationRequest = NotificationCardPayload & {
  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];
};

export type CreateNotificationRequest = CreateAlertNotificationRequest; // will be populated with more variants later on

export type UpdateAlertNotificationRequest = NotificationCardPayload & {
  id: NotificationId;
  active: boolean;
  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];
};

export type UpdateNotificationRequest = UpdateAlertNotificationRequest; // will be populated with more variants later on

export type Notification = NotificationPayload & {
  id: NotificationId;
  active: boolean;

  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];

  creator_id: UserId;
  creator: UserInfo;

  updated_at?: string;
  created_at?: string;
};
