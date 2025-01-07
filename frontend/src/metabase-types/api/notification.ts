import type { CardId } from "metabase-types/api/card";
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
    id?: number;
    card_id: CardId;
    send_once: boolean;
    send_condition: NotificationCardSendCondition;
  };
};

type NotificationDashboardPayload = {
  payload_type: "notification/dashboard";
  payload: {
    id?: number;
    send_once: boolean;
  };
};

type NotificationPayload =
  | NotificationCardPayload
  | NotificationDashboardPayload;

//#endregion

//#region Handler union type
export type NotificationRecipientUser = {
  type: "notification-recipient/user";
  user_id: number;
};

export type NotificationRecipientRawValue = {
  type: "notification-recipient/raw-value";
  details: {
    value: string;
  };
};

export type NotificationRecipient =
  | NotificationRecipientUser
  | NotificationRecipientRawValue;

type NotificationHandlerBase = {
  template_id?: number;
  channel_id?: number;
  active?: boolean;
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
type NotificationCronSubscription = {
  type: "notification-subscription/cron";
  event_name: null;
  cron_schedule: string;
};

//#endregion

export interface ListNotificationsRequest extends PaginationRequest {
  include_inactive?: boolean;
  creator_id?: UserId;
  recipient_id?: UserId;
  card_id?: CardId;
  permission_group_id?: number;
}

export type CreateNotificationRequest = NotificationPayload & {
  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];
};

export type CreateAlertNotificationRequest = NotificationCardPayload & {
  handlers: NotificationHandler[];
  subscriptions: [NotificationCronSubscription];
};

// export interface UpdateNotificationRequest extends NotificationCardPayload {}

export type Notification = NotificationPayload & {
  id: NotificationId;
  active: boolean;

  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];

  creator_id: UserId;
  creator: UserInfo;
};
