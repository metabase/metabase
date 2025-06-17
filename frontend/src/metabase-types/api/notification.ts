import type { Card, CardId } from "metabase-types/api/card";
import type { Channel } from "metabase-types/api/notification-channels";
import type { PaginationRequest } from "metabase-types/api/pagination";
import type { Table, TableId } from "metabase-types/api/table";
import type { UserId, UserInfo } from "metabase-types/api/user";

export type NotificationId = number;

export type NotificationCardSendCondition =
  | "goal_above"
  | "goal_below"
  | "has_result";

// The SystemEvent values that can trigger notifications.
export type NotificationTriggerEvent =
  | "event/row.created"
  | "event/row.updated"
  | "event/row.deleted";

export type NotificationPayloadType =
  | "notification/card"
  | "notification/system-event";

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

type NotificationSystemEventPayload = {
  payload_type: "notification/system-event";
  payload: {
    event_name: NotificationTriggerEvent;
    table_id: TableId;
    table?: Table; // hydrated on the BE
  };
  payload_id: null;
};

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

export type TemplateDetails = {
  type: string;
  subject?: string;
  body: string;
};

export type ChannelTemplate = {
  name?: string;
  channel_type: string;
  details: TemplateDetails;
};

type NotificationHandlerBase = {
  notification_id?: NotificationId;
  template_id?: number | null;
  channel_id?: number | null;
  channel?: Channel | null;
  template?: ChannelTemplate | null; // TODO: hydrated template
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
export type ScheduleDisplayType = "cron/builder" | "cron/raw" | null;
export type NotificationCronSubscription = {
  type: "notification-subscription/cron";
  cron_schedule: string;
  ui_display_type?: ScheduleDisplayType | null;

  // only for existing notifications
  id?: number;
  notification_id?: number;
  created_at?: string;
  updated_at?: string;
};

export type NotificationSubscription = NotificationCronSubscription;

//#endregion

export interface ListNotificationsRequest extends PaginationRequest {
  include_inactive?: boolean;
  creator_id?: UserId;
  recipient_id?: UserId;
  creator_or_recipient_id?: UserId;
  card_id?: CardId;
  permission_group_id?: number;
  table_id?: TableId;
  payload_type?: NotificationPayloadType;
}

export type CreateAlertNotificationRequest = NotificationCardPayload & {
  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];
};

export type CreateTableNotificationRequest = NotificationSystemEventPayload & {
  handlers: NotificationHandler[];
  condition: ConditionalAlertExpression;
};

export type CreateNotificationRequest =
  | CreateAlertNotificationRequest
  | CreateTableNotificationRequest;

export type UpdateAlertNotificationRequest = NotificationCardPayload & {
  id: NotificationId;
  active: boolean;
  handlers: NotificationHandler[];
  subscriptions: NotificationCronSubscription[];
};

export type UpdateTableNotificationRequest = NotificationSystemEventPayload & {
  id: NotificationId;
  active: boolean;
  handlers: NotificationHandler[];
  condition: ConditionalAlertExpression;
};

export type UpdateNotificationRequest =
  | UpdateAlertNotificationRequest
  | UpdateTableNotificationRequest;

export type GetNotificationPayloadExampleRequest = {
  notification: {
    payload_type: NotificationPayloadType;
    payload: Record<string, unknown>;
    creator_id: UserId;
  };
  channel_types: NotificationChannelType[];
};

export type GetNotificationPayloadExampleResponse = Record<
  NotificationChannelType,
  {
    payload: any;
    schema: any;
  }
>;

type BaseNotification = {
  id: NotificationId;
  active: boolean;
  creator_id: UserId;
  creator: UserInfo;
  handlers: NotificationHandler[];

  updated_at?: string;
  created_at?: string;
};

export type AlertNotification = BaseNotification &
  NotificationCardPayload & { subscriptions: NotificationCronSubscription[] };

export type TableNotification = BaseNotification &
  NotificationSystemEventPayload & {
    condition: ConditionalAlertExpression;
  };

export type Notification = AlertNotification | TableNotification;

export type PreviewNotificationTemplateRequest = {
  notification:
    | Notification
    | CreateNotificationRequest
    | UpdateNotificationRequest;
  template: ChannelTemplate;
};
type RenderedEmailPayload = {
  bcc: string[];
  from: string;
  subject: string;
  body: Array<{
    type: "text/html; charset=utf-8";
    content: string;
  }>;
};
export type PreviewNotificationTemplateResponse = {
  context: unknown;
  rendered: RenderedEmailPayload;
  preview_url?: string;
};

// Initial schema for conditional expression.
// Will be updated later.
export type ComparisonOperator = "=" | "!=" | ">" | "<" | ">=" | "<=";
export type LogicalOperator = "and" | "or";
export type FunctionName =
  | ComparisonOperator
  | LogicalOperator
  | "max"
  | "min"
  | "count"
  | "context";
export type Path = Array<string>;
export type Literal = string | number | boolean | null;

export type SingleConditionalAlertExpression = [
  FunctionName,
  Path | SingleConditionalAlertExpression,
  Literal,
];

// Break the recursive definition into separate types
export type ConditionalAlertItem =
  | SingleConditionalAlertExpression
  | MultipleConditionalAlertExpressions;
export type MultipleConditionalAlertExpressions = [
  LogicalOperator,
  ...ConditionalAlertItem[],
];

export type ConditionalAlertExpression =
  | SingleConditionalAlertExpression
  | MultipleConditionalAlertExpressions;
