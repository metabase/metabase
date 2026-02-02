import type {
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api/settings";
import type { User } from "metabase-types/api/user";
import { isObject } from "metabase-types/guards";

type ChannelField = {
  name: string;
  displayName: string;
  options?: string[];
  required?: boolean;
};

export type ChannelSpecRecipients = ("user" | "email")[];

export type ChannelSpec = {
  type: ChannelType;
  name: string;
  schedules: ScheduleType[];
  schedule_type: any;
  allows_recipients: boolean;
  configured: boolean;
  fields?: ChannelField[];
  recipients?: ChannelSpecRecipients;
  error?: any;
};

export type ChannelDetails = {
  url: string;
  "auth-method": NotificationAuthMethods;
  "auth-info"?: Record<string, string>;
  "fe-form-type": NotificationAuthType;
};

export type NotificationAuthMethods =
  | "none"
  | "header"
  | "query-param"
  | "request-body";

export type NotificationAuthType = "none" | "basic" | "bearer" | "api-key";

export type NotificationChannel<Details = ChannelDetails> = {
  active: boolean;
  created_at: string;
  details: Details;
  type: "channel/http";
  updated_at: string;
  id: number;
  name: string;
  description: string;
};

type NotificationChannelTestErrorResponse = {
  data: {
    "request-body": string;
    "request-status": number;
  };
  message: string;
};

export const isNotificationChannelTestErrorResponse = (
  response: unknown,
): response is { data: NotificationChannelTestErrorResponse } => {
  return (
    isObject(response) &&
    isObject(response.data) &&
    isObject(response.data.data) &&
    "request-body" in response.data.data &&
    "request-status" in response.data.data
  );
};

export type SlackChannelSpec = ChannelSpec & {
  fields: ChannelField[];
};

export type EmailChannelSpec = ChannelSpec & {
  recipients: ChannelSpecRecipients;
};

export interface ChannelApiResponse {
  channels: {
    email?: EmailChannelSpec;
    slack?: SlackChannelSpec;
    http?: ChannelSpec;
  };
}

export type ChannelType = keyof ChannelApiResponse["channels"];

export type Channel = {
  channel_type: ChannelType;
  details?: Record<string, string | boolean>;
  enabled?: boolean;
  recipients?: User[];
  channel_id?: number;
} & Pick<
  ScheduleSettings,
  "schedule_day" | "schedule_type" | "schedule_hour" | "schedule_frame"
>;
