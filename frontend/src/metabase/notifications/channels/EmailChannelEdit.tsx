import type { RecipientPickerValue } from "metabase/lib/pulse";
import { isNotNull } from "metabase/lib/types";
import type {
  NotificationHandlerEmail,
  NotificationRecipient,
  User,
} from "metabase-types/api";

import { RecipientPicker } from "./RecipientPicker";

export const EmailChannelEdit = ({
  channel,
  users,
  invalidRecipientText,
  onChange,
}: {
  channel: NotificationHandlerEmail;
  users: User[];
  invalidRecipientText: (domains: string) => string;
  onChange: (newConfig: NotificationHandlerEmail) => void;
}) => {
  const mappedUsers: RecipientPickerValue[] = channel.recipients
    .map(recipient => {
      if (recipient.type === "notification-recipient/user") {
        const user = users.find(({ id }) => id === recipient.user_id);
        if (user) {
          return {
            ...user,
            entityId: recipient.id,
          };
        }
      }

      if (recipient.type === "notification-recipient/raw-value") {
        return {
          entityId: recipient.id,
          email: recipient.details.value,
        };
      }
    })
    .filter(isNotNull);

  const handleRecipientsChange = (recipients: RecipientPickerValue[]) => {
    const mappedUsers: NotificationRecipient[] = recipients.map(recipient => {
      let result: NotificationRecipient;
      if ("id" in recipient) {
        result = {
          type: "notification-recipient/user",
          user_id: recipient.id,
          permissions_group_id: null,
          details: null,
        };
      } else {
        result = {
          type: "notification-recipient/raw-value",
          details: {
            value: recipient.email,
          },
        };
      }

      if (recipient.entityId) {
        result.id = recipient.entityId;
      }

      return result;
    });

    return onChange({
      ...channel,
      recipients: mappedUsers,
    });
  };

  return (
    <RecipientPicker
      recipients={mappedUsers}
      users={users}
      onRecipientsChange={handleRecipientsChange}
      invalidRecipientText={invalidRecipientText}
    />
  );
};
