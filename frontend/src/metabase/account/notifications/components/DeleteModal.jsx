import React from "react";
import PropTypes from "prop-types";
import { msgid, ngettext, t } from "ttag";
import { parseTimestamp } from "metabase/lib/time";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  onClose: PropTypes.func,
};

const DeleteModal = ({ item, type, onClose }) => {
  return (
    <ModalContent
      title={getTitleMessage(type)}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t`Keep it around`}
        </Button>,
        <Button key="unsubscribe" warning onClick={onClose}>
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

DeleteModal.propTypes = propTypes;

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

export default DeleteModal;
