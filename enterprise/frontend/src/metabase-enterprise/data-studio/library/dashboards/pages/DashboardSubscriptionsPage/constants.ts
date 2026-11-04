import type {
  ChannelType,
  IconName,
  SubscriptionSupportingCard,
} from "metabase-types/api";

export const CHANNEL_ICONS = {
  email: "mail",
  slack: "slack",
  http: "webhook",
} as const satisfies Record<ChannelType, IconName>;

export const CARD_ATTACHMENT_FORMATS = [
  { key: "include_csv", label: "CSV" },
  { key: "include_xls", label: "XLSX" },
] as const satisfies {
  key: keyof SubscriptionSupportingCard;
  label: string;
}[];

export const SIDEBAR_WIDTH = 512;

export const TOOLTIP_OPEN_DELAY_MS = 300;
