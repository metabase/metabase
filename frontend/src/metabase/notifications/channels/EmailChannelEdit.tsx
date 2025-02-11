import { useState } from "react";
import { t } from "ttag";

import TextArea from "metabase/core/components/TextArea";
import CS from "metabase/css/core/index.css";
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
  const [template, setTemplate] = useState("");

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

  const handleTemplateChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const newTemplate = event.target.value;
    setTemplate(newTemplate);
    onChange({
      ...channel,
      recipients: channel.recipients,
      template: {
        name: "Email Template",
        channel_type: "channel/email",
        details: {
          type: "email/handlebars-text",
          body: newTemplate,
        },
      },
    });
  };

  return (
    <div>
      <RecipientPicker
        recipients={mappedUsers}
        users={users}
        onRecipientsChange={handleRecipientsChange}
        invalidRecipientText={invalidRecipientText}
      />
      <div className={CS.mt2}>
        <TextArea
          value={template}
          onChange={handleTemplateChange}
          placeholder={t`Your handlebars template here...`}
          fullWidth
          rows={4}
        />
      </div>
    </div>
  );
};
