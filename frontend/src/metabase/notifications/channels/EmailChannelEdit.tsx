import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import { ChannelSettingsBlock } from "metabase/notifications/channels/ChannelSettingsBlock";
import type { NotificationHandlerEmail, User } from "metabase-types/api";

import { RecipientPicker } from "./RecipientPicker";

export const EmailChannelEdit = ({
  channel,
  users,
  invalidRecipientText,
  onRemoveChannel,
  onChange,
}: {
  channel: NotificationHandlerEmail;
  users: User[];
  invalidRecipientText: (domains: string) => string;
  onRemoveChannel: () => void;
  onChange: (newConfig: NotificationHandlerEmail) => void;
}) => {
  const mappedUsers = channel.recipients
    .map(recipient =>
      users.find(
        ({ id }) =>
          recipient.type === "notification-recipient/user" &&
          id === recipient.user_id,
      ),
    )
    .filter(isNotNull);

  const handleRecipientsChange = (recipients: User[]) =>
    onChange({
      ...channel,
      recipients: recipients.map(({ id }) => ({
        type: "notification-recipient/user",
        user_id: id,
        permissions_group_id: null,
        details: null,
      })),
    });

  return (
    <ChannelSettingsBlock
      title={t`Email`}
      iconName="mail"
      onRemoveChannel={onRemoveChannel}
    >
      <RecipientPicker
        recipients={mappedUsers}
        users={users}
        onRecipientsChange={handleRecipientsChange}
        invalidRecipientText={invalidRecipientText}
      />
    </ChannelSettingsBlock>
  );
};
