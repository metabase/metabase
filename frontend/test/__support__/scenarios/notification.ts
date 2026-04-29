import type { ChannelApiResponse } from "metabase-types/api";

import { setupNotificationChannelsEndpoints } from "../server-mocks";

const EMAIL_CHANNEL = {
  type: "email",
  name: "Email",
  allows_recipients: true,
  recipients: ["user", "email"],
  schedules: ["hourly"],
  configured: true,
} as const;

const SLACK_CHANNEL = {
  type: "slack",
  name: "Slack",
  allows_recipients: false,
  schedules: ["hourly"],
  configured: true,
  fields: [
    {
      name: "channel",
      type: "select",
      displayName: "Post to",
      options: [
        { displayName: "#general", id: "C001" },
        { displayName: "#random", id: "C002" },
        { displayName: "#alerts", id: "C003" },
      ],
      required: true,
    },
  ],
} as const;

export type NotificationChannelsScenarioOptions = {
  email?: boolean;
  slack?: boolean;
};

/**
 * Builds the standard channels-payload shape that subscription/alert
 * tests pass to `/api/pulse/form_input`. Use either with the helper
 * below or directly via `setupNotificationChannelsEndpoints`.
 */
export function notificationChannels({
  email = false,
  slack = false,
}: NotificationChannelsScenarioOptions = {}) {
  const channels: NonNullable<ChannelApiResponse["channels"]> = {};
  if (email) {
    channels.email = EMAIL_CHANNEL as any;
  }
  if (slack) {
    channels.slack = SLACK_CHANNEL as any;
  }
  return channels;
}

/**
 * Registers the form-input endpoint with channels enabled per the flags.
 * Replaces the ~40-line inline `channelData` construction blocks.
 */
export function setupNotificationChannelsScenario(
  options: NotificationChannelsScenarioOptions = {},
) {
  setupNotificationChannelsEndpoints(notificationChannels(options));
}
