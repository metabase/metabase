import type { NotificationCardSendCondition } from "metabase-types/api";

// TODO: combine this with api types
export type NotificationTriggerOption = {
  value: NotificationCardSendCondition;
  label: string;
};
