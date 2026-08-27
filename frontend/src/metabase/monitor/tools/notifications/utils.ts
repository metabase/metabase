import type {
  AdminNotification,
  NotificationChannelType,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
} from "metabase-types/api";

export type ChannelSummary<TChannel extends NotificationChannelType> = {
  channel: TChannel;
  count: number;
  recipients: Extract<
    NotificationHandler,
    { channel_type: TChannel }
  >["recipients"];
};

export type ChannelSummaries = {
  [TChannel in NotificationChannelType]: ChannelSummary<TChannel>;
};

type AnyChannelSummary = ChannelSummaries[NotificationChannelType];

const CHANNEL_TYPES: NotificationChannelType[] = [
  "channel/email",
  "channel/slack",
  "channel/http",
];

export const getHandlerTargetCount = (
  handler: NotificationHandler | undefined,
): number => {
  if (!handler) {
    return 0;
  }
  if (handler.channel_type === "channel/http") {
    // Webhook handlers target the configured HTTP channel via channel_id, not recipients.
    return 1;
  }
  return handler.recipients.length;
};

const buildSummary = <TChannel extends NotificationChannelType>(
  channel: TChannel,
  handlers: NotificationHandler[],
  recipients: ChannelSummary<TChannel>["recipients"],
): ChannelSummary<TChannel> => ({
  channel,
  count: handlers.reduce(
    (total, handler) => total + getHandlerTargetCount(handler),
    0,
  ),
  recipients,
});

const isEmailHandler = (
  handler: NotificationHandler,
): handler is NotificationHandlerEmail =>
  handler.channel_type === "channel/email";

const isSlackHandler = (
  handler: NotificationHandler,
): handler is NotificationHandlerSlack =>
  handler.channel_type === "channel/slack";

const isHttpHandler = (
  handler: NotificationHandler,
): handler is NotificationHandlerHttp =>
  handler.channel_type === "channel/http";

export const summarizeChannels = (
  notification: AdminNotification,
): ChannelSummaries => {
  const handlers = notification.handlers ?? [];
  const email = handlers.filter(isEmailHandler);
  const slack = handlers.filter(isSlackHandler);
  const http = handlers.filter(isHttpHandler);
  return {
    "channel/email": buildSummary(
      "channel/email",
      email,
      email.flatMap((handler) => handler.recipients),
    ),
    "channel/slack": buildSummary(
      "channel/slack",
      slack,
      slack.flatMap((handler) => handler.recipients),
    ),
    "channel/http": buildSummary(
      "channel/http",
      http,
      http.flatMap((handler) => handler.recipients),
    ),
  };
};

export const listChannelSummaries = (
  notification: AdminNotification,
): AnyChannelSummary[] => {
  const summaries = summarizeChannels(notification);
  return CHANNEL_TYPES.map((channel) => summaries[channel]).filter(
    (summary) => summary.count > 0,
  );
};
