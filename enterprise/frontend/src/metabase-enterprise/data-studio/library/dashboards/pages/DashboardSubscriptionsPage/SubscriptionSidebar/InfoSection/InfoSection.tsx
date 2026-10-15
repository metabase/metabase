import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import {
  type SubscriptionRecipient,
  formatFilter,
  getActiveFilters,
  getChannelRecipients,
} from "metabase/notifications/pulse/subscription-formatting";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { SidebarInfoRow } from "metabase/transforms/components/SidebarInfoRow";
import { Card, Group, Stack, Text } from "metabase/ui";
import type {
  Channel,
  DashboardSubscription,
  Parameter,
} from "metabase-types/api";

import { getCardAttachments, getChannelDescription } from "../../utils";

type InfoSectionProps = {
  subscription: DashboardSubscription;
  channel: Channel;
  parameters: Parameter[];
};

export function InfoSection({
  subscription,
  channel,
  parameters,
}: InfoSectionProps) {
  const filters = getActiveFilters(subscription, parameters);

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <SidebarInfoRow label={t`Sends`}>
        {getChannelDescription(channel)}
      </SidebarInfoRow>
      {channel.channel_type === "email" && (
        <SidebarInfoRow label={t`Recipients`}>
          <RecipientList channel={channel} />
        </SidebarInfoRow>
      )}
      <SidebarInfoRow label={t`Filters`}>
        {filters.length > 0 ? (
          filters.map((filter) => (
            <Text key={filter.id}>{formatFilter(filter)}</Text>
          ))
        ) : (
          <Text c="text-secondary">{t`No filters`}</Text>
        )}
      </SidebarInfoRow>
      <SidebarInfoRow label={t`Attachments`}>
        <AttachmentList subscription={subscription} channel={channel} />
      </SidebarInfoRow>
      <SidebarInfoRow label={t`When there are no results`}>
        {subscription.skip_if_empty ? t`Don't send` : t`Send anyway`}
      </SidebarInfoRow>
      <SidebarInfoRow label={t`Created by`}>
        {subscription.creator.common_name}
      </SidebarInfoRow>
      <SidebarInfoRow label={t`Created at`}>
        <DateTime value={subscription.created_at} unit="day" />
      </SidebarInfoRow>
    </Card>
  );
}

type RecipientListProps = {
  channel: Channel;
};

function RecipientList({ channel }: RecipientListProps) {
  const recipients = getChannelRecipients(channel);

  if (recipients.length === 0) {
    return <Text c="text-secondary">{t`No recipients`}</Text>;
  }

  return (
    <Stack gap="sm">
      {recipients.map((recipient) => (
        <RecipientItem
          key={`${recipient.type}-${recipient.email}`}
          recipient={recipient}
        />
      ))}
    </Stack>
  );
}

type RecipientItemProps = {
  recipient: SubscriptionRecipient;
};

function RecipientItem({ recipient }: RecipientItemProps) {
  const applicationName = useSelector(getApplicationName);
  const [primaryText, secondaryText] =
    recipient.type === "user"
      ? [recipient.name, recipient.email]
      : [recipient.email, t`Not a ${applicationName} user`];

  return (
    <Stack gap={0} data-testid="subscription-recipient">
      <Text className={CS.textWrap}>{primaryText}</Text>
      <Text className={CS.textWrap} fz="sm" lh="h5" c="text-secondary">
        {secondaryText}
      </Text>
    </Stack>
  );
}

type AttachmentListProps = {
  subscription: DashboardSubscription;
  channel: Channel;
};

function AttachmentList({ subscription, channel }: AttachmentListProps) {
  const includesPdf = channel.details?.include_pdf === true;
  const isAttachmentOnly = channel.details?.attachment_only === true;
  const cardAttachments = getCardAttachments(subscription);
  const hasAttachments = includesPdf || cardAttachments.length > 0;

  if (!hasAttachments) {
    return <Text c="text-secondary">{t`No attachments`}</Text>;
  }

  return (
    <Stack gap="xs">
      {includesPdf && <Text>{t`PDF of the dashboard`}</Text>}
      {cardAttachments.map((attachment) => (
        <Group
          key={attachment.dashcardId}
          justify="space-between"
          gap="md"
          wrap="nowrap"
          data-testid="subscription-card-attachment"
        >
          <Text className={CS.textWrap}>
            {attachment.name ?? t`Untitled question`}
          </Text>
          <Text c="text-secondary">{attachment.formats.join(", ")}</Text>
        </Group>
      ))}
      {isAttachmentOnly && (
        <Text c="text-secondary">{t`Send only attachments (no charts)`}</Text>
      )}
    </Stack>
  );
}
