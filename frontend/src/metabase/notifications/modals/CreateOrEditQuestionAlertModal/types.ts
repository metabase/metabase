import type { NotificationCardSendCondition } from "metabase-types/api";

export type NotificationTriggerValue =
  | NotificationCardSendCondition
  | "watch_new_rows";

// TODO: combine this with api types
export type NotificationTriggerOption = {
  value: NotificationTriggerValue;
  label: string;
};
