import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { msgid, ngettext, t } from "ttag";
import { parseTimestamp } from "metabase/lib/time";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  onArchive: PropTypes.func,
  onClose: PropTypes.func,
};

const ArchiveModal = ({ item, type, onArchive, onClose }) => {
  const handleArchiveClick = useCallback(async () => {
    await onArchive(item);
    onClose();
  }, [item, onArchive, onClose]);

  return (
    <ModalContent
      title={getTitleMessage(type)}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t`I changed my mind`}
        </Button>,
        <Button key="delete" warning onClick={handleArchiveClick}>
          {getSubmitMessage(type)}
        </Button>,
      ]}
      onClose={onClose}
    >
      <div>
        {getDateMessage(item)}
        {getRecipientsMessage(item)}
      </div>
    </ModalContent>
  );
};

ArchiveModal.propTypes = propTypes;

const getTitleMessage = type => {
  switch (type) {
    case "alert":
      return t`Delete this alert?`;
    case "pulse":
      return t`Delete this subscription?`;
  }
};

const getSubmitMessage = type => {
  switch (type) {
    case "alert":
      return t`Yes, delete this alert`;
    case "pulse":
      return t`Yes, delete this subscription.`;
  }
};

const getDateMessage = (item, type) => {
  const createdAt = parseTimestamp(item.created_at).format("L");

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
