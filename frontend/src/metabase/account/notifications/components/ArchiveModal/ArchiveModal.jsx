import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { msgid, ngettext, t } from "ttag";
import Settings from "metabase/lib/settings";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import FormMessage from "metabase/components/form/FormMessage";

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
      await onArchive(item);
      onClose();
    } catch (error) {
      setError(error);
    }
  }, [item, onArchive, onClose]);

  return (
    <ModalContent
      title={getTitleMessage(type)}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>
          {t`I changed my mind`}
        </Button>,
        <Button key="submit" warning onClick={handleArchiveClick}>
          {getSubmitMessage(type)}
        </Button>,
      ]}
      onClose={onClose}
    >
      {isCreator(item, user) && hasUnsubscribed && (
        <div>
          {getCreatorMessage(user)}
          {t`As the creator you can also choose to delete this if it’s no longer relevant to others as well.`}
        </div>
      )}
      <div>
        {getDateMessage(item, type)}
        {getRecipientsMessage(item)}
      </div>
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

const getCreatorMessage = user => {
  return t`You won’t receive this alert at ${user.email} any more.`;
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
  const emailCount = getRecipientsCount(item, "email");
  const slackCount = getRecipientsCount(item, "slack");

  const emailMessage = ngettext(
    msgid`${emailCount} email`,
    `${emailCount} emails`,
    emailCount,
  );

  const slackMessage = ngettext(
    msgid`${slackCount} Slack channel`,
    `${slackCount} Slack channels`,
    slackCount,
  );

  if (emailCount && slackCount) {
    return t`It’s currently being sent to ${emailMessage} and ${slackMessage}.`;
  } else if (emailCount) {
    return t`It’s currently being sent to ${emailMessage}.`;
  } else if (slackCount) {
    return t`It’s currently being sent to ${slackMessage}.`;
  }
};

const getRecipientsCount = (item, channelType) => {
  return item.channels
    .filter(channel => channel.channel_type === channelType)
    .reduce((total, channel) => total + channel.recipients.length, 0);
};

export default ArchiveModal;
