import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { msgid, ngettext, t } from "ttag";
import { parseTimestamp } from "metabase/lib/time";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  onDelete: PropTypes.func,
  onClose: PropTypes.func,
};

const DeleteModal = ({ item, type, onDelete, onClose }) => {
  const handleDelete = useCallback(async () => {
    await onDelete(item);
    onClose();
  }, [item, onDelete, onClose]);

  return (
    <ModalContent
      title={getTitleMessage(type)}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t`Keep it around`}
        </Button>,
        <Button key="unsubscribe" warning onClick={handleDelete}>
          {getSubmitMessage(type)}
        </Button>,
      ]}
      onClose={onClose}
    >
      <div>
        {getCreatorEmailMessage(item, type)} {getCreatorChoiceMessage()}
      </div>
      <div>
        {getCreatedDateMessage(item)} {getRecipientsMessage(item)}
      </div>
    </ModalContent>
  );
};

DeleteModal.propTypes = propTypes;

const getTitleMessage = type => {
  switch (type) {
    case "alert":
      return t`You’re unsubscribed. Delete this alert as well?`;
    case "pulse":
      return t`You’re unsubscribed. Delete this subscription as well?`;
  }
};

const getSubmitMessage = type => {
  switch (type) {
    case "alert":
      return t`Delete this alert`;
    case "pulse":
      return t`Delete this subscription`;
  }
};

const getCreatorEmailMessage = (item, type) => {
  switch (type) {
    case "alert":
      return t`You won’t receive this alert at ${item.creator.email} any more.`;
    case "pulse":
      return t`You won’t receive this subscription at ${item.creator.email} any more.`;
  }
};

const getCreatorChoiceMessage = () => {
  return t`As the creator you can also choose to delete this if it’s no longer relevant to others as well.`;
};

const getCreatedDateMessage = (item, type) => {
  const createdAt = parseTimestamp(item.created_at).format("L");

  switch (type) {
    case "alert":
      return t`You created this alert on ${createdAt}.`;
    case "pulse":
      return t`You created this subscription on ${createdAt}.`;
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

export default DeleteModal;
