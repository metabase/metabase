import type { ScheduleSettings } from "metabase-types/api/settings";

import type { Card } from "./card";
import type { User } from "./user";

export type NotificationRecipient = {
  id: string;
  email: string;
};

export type Channel = {
  channel_type: string;
  details: Record<string, string>;
  enabled?: boolean;
  recipients?: User[];
} & Pick<
  ScheduleSettings,
  "schedule_day" | "schedule_type" | "schedule_hour" | "schedule_frame"
>;

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
  schedules: ScheduleValue[];
  schedule_type: any;
  allows_recipients: boolean;
  configured: boolean;
  fields?: ChannelField[];
  recipients?: ChannelSpecRecipients;
  error?: any;
};

export type Pulse = {
  cards: Card[];
  channels: Channel[];
  name?: string;
  parameters?: any[];
};

export type PulseParameter = {
  default: boolean;
  id: number;
  name?: string;
  slug?: string;
  type?: string;
  value?: string;
};

type ScheduleValue = "hourly" | "daily" | "weekly" | "monthly";

export type SlackChannelSpec = ChannelSpec & {
  fields: ChannelField[];
};

type EmailChannelSpec = ChannelSpec & {
  recipients: ("user" | "email")[];
};
export interface FormInput {
  channels: {
    email: SlackChannelSpec;
    slack: EmailChannelSpec;
  };
}

export type ChannelType = keyof FormInput["channels"];
