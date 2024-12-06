import type { Alert, EmailChannelSpec, User } from "metabase-types/api";

import { RecipientPicker } from "./RecipientPicker";

export const EmailChannelEdit = ({
  channelSpec,
  alert,
  toggleChannel,
  onChannelPropertyChange,
  users,
  user,
  invalidRecipientText,
}: {
  channelSpec: EmailChannelSpec;
  alert: Alert;
  toggleChannel: (channel: "email", index: number, value: boolean) => void;
  user: User;
  users: User[];
  onChannelPropertyChange: (index: number, name: string, value: any) => void;
  invalidRecipientText: (domains: string) => string;
}) => {
  const channelIndex = alert.channels.findIndex(
    channel => channel.channel_type === "email",
  );
  const channel = alert.channels[channelIndex];

  const handleRecipientsChange = (recipients: User[]) =>
    onChannelPropertyChange(channelIndex, "recipients", recipients);

  return (
    <RecipientPicker
      autoFocus={!!alert.name}
      recipients={channel.recipients}
      users={users}
      onRecipientsChange={handleRecipientsChange}
      invalidRecipientText={invalidRecipientText}
    />
  );
};
