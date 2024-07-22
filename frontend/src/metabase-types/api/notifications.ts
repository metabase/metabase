import type { Card } from "./card";

export type NotificationRecipient = {
  id: string;
  email: string;
};

export type Channel = {
  channel_type: string;
  details: Record<string, string>;
  enabled?: boolean;
  recipients?: NotificationRecipient[];
  schedule_day?: null | "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
  schedule_frame?: null | "first";
  schedule_hour?: number | null;
  schedule_type?: "hourly" | "daily" | "weekly" | "monthly";
};

type ChannelField = {
  name: string;
  displayName: string;
  options?: string[];
  required?: boolean;
};

export type ChannelSpec = {
  fields: ChannelField[];
  type: string;
  schedules: any[];
  schedule_type: any;
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

type ChannelDetails = {
  url: string;
  "auth-method": NotificationAuthMethods;
};

export type NotificationAuthMethods =
  | "none"
  | "header"
  | "query-param"
  | "request-body";

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
