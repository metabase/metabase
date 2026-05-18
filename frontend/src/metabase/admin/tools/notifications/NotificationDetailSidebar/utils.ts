import { t } from "ttag";

import type {
  NotificationChannelType,
  NotificationHandler,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  NotificationRecipient,
} from "metabase-types/api";

export const findEmailHandler = (
  handlers: NotificationHandler[],
): NotificationHandlerEmail | undefined => {
  for (const handler of handlers) {
    if (handler.channel_type === "channel/email") {
      return handler;
    }
  }
  return undefined;
};

export const findSlackHandler = (
  handlers: NotificationHandler[],
): NotificationHandlerSlack | undefined => {
  for (const handler of handlers) {
    if (handler.channel_type === "channel/slack") {
      return handler;
    }
  }
  return undefined;
};

export const findHttpHandler = (
  handlers: NotificationHandler[],
): NotificationHandlerHttp | undefined => {
  for (const handler of handlers) {
    if (handler.channel_type === "channel/http") {
      return handler;
    }
  }
  return undefined;
};

export const getUniqueChannelTypes = (
  handlers: NotificationHandler[] | undefined,
): NotificationChannelType[] => {
  if (!handlers) {
    return [];
  }
  const seen = new Set<NotificationChannelType>();
  const result: NotificationChannelType[] = [];
  for (const handler of handlers) {
    if (!seen.has(handler.channel_type)) {
      seen.add(handler.channel_type);
      result.push(handler.channel_type);
    }
  }
  return result;
};

export const getEmailRowText = (
  recipient: NotificationRecipient,
): { name: string; email: string | null } => {
  if (recipient.type === "notification-recipient/user") {
    const user = recipient.user;
    if (!user) {
      return { name: t`Deactivated user`, email: null };
    }
    return {
      name: user.common_name ?? user.email ?? t`Unknown`,
      email: user.email ?? null,
    };
  }
  if (recipient.type === "notification-recipient/raw-value") {
    const value = recipient.details?.value ?? "";
    return { name: value, email: null };
  }
  return { name: t`Group recipient`, email: null };
};

type ChannelSummaryInput = {
  emailRecipientCount: number;
  slackChannelCount: number;
  httpHandler: NotificationHandlerHttp | undefined;
};

export const formatChannelSummary = ({
  emailRecipientCount,
  slackChannelCount,
  httpHandler,
}: ChannelSummaryInput): string => {
  const parts: string[] = [];
  if (emailRecipientCount > 0) {
    parts.push(
      emailRecipientCount === 1
        ? t`1 email recipient`
        : t`${emailRecipientCount} email recipients`,
    );
  }
  if (slackChannelCount > 0) {
    parts.push(
      slackChannelCount === 1
        ? t`1 Slack channel`
        : t`${slackChannelCount} Slack channels`,
    );
  }
  if (httpHandler && httpHandler.recipients.length > 0) {
    const count = httpHandler.recipients.length;
    parts.push(count === 1 ? t`1 webhook` : t`${count} webhooks`);
  }
  return parts.join(", ");
};
