import PropTypes from "prop-types";
import { useCallback, useState } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import { FormMessage } from "metabase/forms";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { formatChannelRecipients } from "metabase/lib/notifications";
import Settings from "metabase/lib/settings";

import { ModalMessage } from "./ArchiveModal.styled";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  user: PropTypes.object,
  hasUnsubscribed: PropTypes.bool,
  onArchive: PropTypes.func,
  onClose: PropTypes.func,
};

const ArchiveModal = ({
  item,
  type,
  user,
  hasUnsubscribed,
  onArchive,
  onClose,
}) => {
  const [error, setError] = useState();

  const handleArchiveClick = useCallback(async () => {
    try {
      await onArchive(item, true);
      onClose();
    } catch (error) {
      setError(error);
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

ArchiveModal.propTypes = propTypes;

const isCreator = (item, user) => {
  return user != null && user.id === item.creator?.id;
};

const getTitleMessage = (type, hasUnsubscribed) => {
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

const getSubmitMessage = (type, hasUnsubscribed) => {
  switch (type) {
    case "alert":
      return hasUnsubscribed ? t`Delete this alert` : t`Yes, delete this alert`;
    case "pulse":
      return hasUnsubscribed
        ? t`Delete this subscription`
        : t`Yes, delete this subscription`;
  }
};

const getCancelMessage = hasUnsubscribed => {
  return hasUnsubscribed ? t`Keep it around` : t`I changed my mind`;
};

const getCreatorMessage = (type, user) => {
  switch (type) {
    case "alert":
      return t`You won’t receive this alert at ${user.email} any more. `;
    case "pulse":
      return t`You won’t receive this subscription at ${user.email} any more. `;
  }
};

const getDateMessage = (item, type) => {
  const options = Settings.formattingOptions();
  const createdAt = formatDateTimeWithUnit(item.created_at, "day", options);

  switch (type) {
    case "alert":
      return t`You created this alert on ${createdAt}. `;
    case "pulse":
      return t`You created this subscription on ${createdAt}. `;
  }
};

const getRecipientsMessage = item => {
  return t`It’s currently being sent to ${formatChannelRecipients(item)}.`;
};

export default ArchiveModal;
