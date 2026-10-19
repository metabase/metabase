import { match } from "ts-pattern";
import { t } from "ttag";

import {
  buildFilterText,
  buildRecipientText,
  formatSubscriptionSchedule,
  getChannelRecipients,
} from "metabase/notifications/pulse/subscription-formatting";
import * as Urls from "metabase/urls";
import type {
  Channel,
  ChannelType,
  DashCardId,
  DashboardSubscription,
  Parameter,
  SubscriptionSupportingCard,
} from "metabase-types/api";

import { CARD_ATTACHMENT_FORMATS } from "./constants";

export type SubscriptionRow = {
  id: DashboardSubscription["id"];
  channelType: ChannelType;
  schedule: string;
  recipients: string;
  /** Every email recipient's name and address, which `recipients` abbreviates. */
  recipientSearchTerms: string[];
  filters: string;
  creatorName: string;
};

export function getSubscriptionRows(
  subscriptions: readonly DashboardSubscription[],
  parameters: Parameter[],
): SubscriptionRow[] {
  return subscriptions.flatMap((subscription) => {
    const [channel] = subscription.channels;
    if (channel == null) {
      return [];
    }
    return [
      {
        id: subscription.id,
        channelType: channel.channel_type,
        schedule: formatSubscriptionSchedule(channel),
        recipients: getRecipientsText(subscription, channel),
        recipientSearchTerms: getRecipientSearchTerms(channel),
        filters: buildFilterText(subscription, parameters),
        creatorName: subscription.creator.common_name,
      },
    ];
  });
}

function getRecipientsText(
  subscription: DashboardSubscription,
  channel: Channel,
): string {
  return channel.channel_type === "slack"
    ? (channel.details?.channel ?? "")
    : buildRecipientText(subscription);
}

function getRecipientSearchTerms(channel: Channel): string[] {
  return getChannelRecipients(channel).flatMap((recipient) =>
    recipient.type === "user"
      ? [recipient.name, recipient.email]
      : [recipient.email],
  );
}

export type SubscriptionSelection =
  | { type: "none" }
  | { type: "missing" }
  | { type: "found"; subscription: DashboardSubscription; channel: Channel };

export function getSubscriptionSelection(
  subscriptions: readonly DashboardSubscription[],
  subscriptionIdParam: string | undefined,
): SubscriptionSelection {
  if (subscriptionIdParam == null) {
    return { type: "none" };
  }
  const subscriptionId = Urls.extractEntityId(subscriptionIdParam);
  const subscription = subscriptions.find(({ id }) => id === subscriptionId);
  const [channel] = subscription?.channels ?? [];
  return subscription != null && channel != null
    ? { type: "found", subscription, channel }
    : { type: "missing" };
}

export function filterSubscriptionRows(
  rows: SubscriptionRow[],
  searchQuery: string,
): SubscriptionRow[] {
  const query = searchQuery.trim().toLowerCase();
  if (query.length === 0) {
    return rows;
  }
  return rows.filter((row) =>
    [
      row.schedule,
      row.recipients,
      ...row.recipientSearchTerms,
      row.filters,
      row.creatorName,
    ].some((text) => text.toLowerCase().includes(query)),
  );
}

// An hourly schedule has no time of day, so it carries no timezone.
export function formatChannelSchedule(
  channel: Channel,
  timezone: string,
): string {
  const schedule = formatSubscriptionSchedule(channel);
  if (
    channel.schedule_type === "hourly" ||
    channel.schedule_hour == null ||
    !timezone
  ) {
    return schedule;
  }
  // Not translated: ttag rejects a message made only of placeholders
  return `${schedule} ${timezone}`;
}

export function getChannelDescription({
  channel_type,
  details,
}: Channel): string {
  return match(channel_type)
    .with("email", () =>
      details?.subject
        ? t`Email with the subject "${details.subject}"`
        : t`Email with the default subject`,
    )
    .with("slack", () =>
      details?.channel
        ? t`Slack message to ${details.channel}`
        : t`Slack message`,
    )
    .with("http", () => t`Webhook`)
    .exhaustive();
}

export type CardAttachment = {
  dashcardId: DashCardId;
  name: SubscriptionSupportingCard["name"];
  formats: string[];
};

export function getCardAttachments(
  subscription: DashboardSubscription,
): CardAttachment[] {
  return subscription.cards.flatMap((card) => {
    const formats = CARD_ATTACHMENT_FORMATS.filter(({ key }) => card[key]).map(
      ({ label }) => label,
    );
    return formats.length > 0
      ? [{ dashcardId: card.dashboard_card_id, name: card.name, formats }]
      : [];
  });
}
