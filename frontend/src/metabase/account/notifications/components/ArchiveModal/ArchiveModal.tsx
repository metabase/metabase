import { useCallback, useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { ModalContent } from "metabase/common/components/ModalContent";
import { FormMessage } from "metabase/forms";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { formatChannelRecipients } from "metabase/lib/pulse";
import Settings from "metabase/lib/settings";
import type { Alert, Notification, User } from "metabase-types/api";

import { ModalMessage } from "./ArchiveModal.styled";

interface ArchiveModalProps {
  item: Alert | Notification;
  type: "alert" | "pulse";
  user?: User | null;
  hasUnsubscribed?: boolean;
  onArchive?: (item: Alert | Notification, archived: boolean) => Promise<void>;
  onClose?: () => void;
}

const ArchiveModal = ({
  item,
  type,
  user,
  hasUnsubscribed,
  onArchive,
  onClose,
}: ArchiveModalProps) => {
  const [error, setError] = useState<string>();

  const handleArchiveClick = useCallback(async () => {
    try {
      await onArchive?.(item, true);
      onClose?.();
    } catch (error) {
      setError(error as string);
    }
  }, [item, onArchive, onClose]);

  return (
    <ModalContent
      title={getTitleMessage(type, hasUnsubscribed)}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>
          {getCancelMessage(hasUnsubscribed)}
        </Button>,
        <Button key="submit" warning onClick={handleArchiveClick}>
          {getSubmitMessage(type, hasUnsubscribed)}
        </Button>,
      ]}
      onClose={onClose}
    >
      {isCreator(item, user) && hasUnsubscribed && (
        <ModalMessage data-server-date>
          {getCreatorMessage(type, user)}
          {t`As the creator you can also choose to delete this if it’s no longer relevant to others as well.`}
        </ModalMessage>
      )}
      <ModalMessage>
        {getDateMessage(item, type)}
        {getRecipientsMessage(item)}
      </ModalMessage>
    </ModalContent>
  );
};

const isCreator = (item: Alert | Notification, user?: User | null) => {
  return user != null && user.id === item.creator?.id;
};

const getTitleMessage = (type: "alert" | "pulse", hasUnsubscribed?: boolean) => {
  switch (type) {
    case "alert":
      return hasUnsubscribed
        ? t`You’re unsubscribed. Delete this alert as well?`
        : t`Delete this alert?`;
    case "pulse":
      return hasUnsubscribed
        ? t`You’re unsubscribed. Delete this subscription as well?`
        : t`Delete this subscription?`;
  }
};

const getSubmitMessage = (type: "alert" | "pulse", hasUnsubscribed?: boolean) => {
  switch (type) {
    case "alert":
      return hasUnsubscribed ? t`Delete this alert` : t`Yes, delete this alert`;
    case "pulse":
      return hasUnsubscribed
        ? t`Delete this subscription`
        : t`Yes, delete this subscription`;
  }
};

const getCancelMessage = (hasUnsubscribed?: boolean) => {
  return hasUnsubscribed ? t`Keep it around` : t`I changed my mind`;
};

const getCreatorMessage = (type: "alert" | "pulse", user: User) => {
  switch (type) {
    case "alert":
      return t`You won’t receive this alert at ${user.email} any more. `;
    case "pulse":
      return t`You won’t receive this subscription at ${user.email} any more. `;
  }
};

const getDateMessage = (item: Alert | Notification, type: "alert" | "pulse") => {
  const options = Settings.formattingOptions();
  const createdAt = formatDateTimeWithUnit(item.created_at, "day", options);

  switch (type) {
    case "alert":
      return t`You created this alert on ${createdAt}. `;
    case "pulse":
      return t`You created this subscription on ${createdAt}. `;
  }
};

const getRecipientsMessage = (item: Alert | Notification) => {
  return t`It’s currently being sent to ${formatChannelRecipients(item)}.`;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ArchiveModal;
