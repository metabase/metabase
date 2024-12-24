import { t } from "ttag";

import { ChannelSettingsBlock } from "metabase/notifications/ChannelSettingsBlock";
import type { ChannelType, CreateAlertRequest, User } from "metabase-types/api";

import { RecipientPicker } from "./RecipientPicker";

export const EmailChannelEdit = ({
  alert,
  users,
  invalidRecipientText,
  onRemoveChannel,
  onChannelPropertyChange,
}: {
  alert: CreateAlertRequest;
  users: User[];
  invalidRecipientText: (domains: string) => string;
  onRemoveChannel: (type: ChannelType, index: number) => void;
  onChannelPropertyChange: (index: number, name: string, value: any) => void;
}) => {
  const channelIndex = alert.channels.findIndex(
    channel => channel.channel_type === "email",
  );
  const channel = alert.channels[channelIndex];

  const handleRecipientsChange = (recipients: User[]) =>
    onChannelPropertyChange(channelIndex, "recipients", recipients);

  return (
    <ChannelSettingsBlock
      title={t`Email`}
      iconName="mail"
      onRemoveChannel={() => onRemoveChannel("email", channelIndex)}
    >
      <RecipientPicker
        recipients={channel.recipients}
        users={users}
        onRecipientsChange={handleRecipientsChange}
        invalidRecipientText={invalidRecipientText}
      />
    </ChannelSettingsBlock>
  );
};
