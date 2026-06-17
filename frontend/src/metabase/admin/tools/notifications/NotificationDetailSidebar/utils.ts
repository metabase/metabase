import { t } from "ttag";

import type { NotificationRecipient } from "metabase-types/api";

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

export const getEmailRecipientLabel = (count: number): string =>
  count === 1 ? t`1 email recipient` : t`${count} email recipients`;

export const getSlackChannelLabel = (count: number): string =>
  count === 1 ? t`1 Slack channel` : t`${count} Slack channels`;

export const getWebhookLabel = (count: number): string =>
  count === 1 ? t`1 webhook` : t`${count} webhooks`;

type ChannelSummaryInput = {
  emailRecipientCount: number;
  slackChannelCount: number;
  webhookCount: number;
};

export const formatChannelSummary = ({
  emailRecipientCount,
  slackChannelCount,
  webhookCount,
}: ChannelSummaryInput): string => {
  const parts: string[] = [];
  if (emailRecipientCount > 0) {
    parts.push(getEmailRecipientLabel(emailRecipientCount));
  }
  if (slackChannelCount > 0) {
    parts.push(getSlackChannelLabel(slackChannelCount));
  }
  if (webhookCount > 0) {
    parts.push(getWebhookLabel(webhookCount));
  }
  return parts.join(", ");
};
