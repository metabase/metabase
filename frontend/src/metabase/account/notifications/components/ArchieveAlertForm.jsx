import React from "react";
import PropTypes from "prop-types";
import { msgid, ngettext, t } from "ttag";
import { parseTimestamp } from "metabase/lib/time";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

const propTypes = {
  alert: PropTypes.object,
  onArchive: PropTypes.func,
  onClose: PropTypes.func,
};

const ArchiveAlertModal = ({ alert, onArchive, onClose }) => {
  return (
    <ModalContent
      title={t`You’re unsubscribed. Delete this alert as well?`}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t`Keep it around`}
        </Button>,
        <Button key="unsubscribe" warning onClick={onArchive}>
          {t`Delete this alert`}
        </Button>,
      ]}
      onClose={onClose}
    >
      <div>
        {getCreatedUserMessage(alert)}
        {t`As the creator you can also choose to delete this if it’s no longer relevant to others as well.`}
      </div>
      <div>
        {getCreatedDateMessage(alert)} {getRecipientsMessage(alert)}
      </div>
    </ModalContent>
  );
};

ArchiveAlertModal.propTypes = propTypes;

const getCreatedUserMessage = alert => {
  return t`You won’t receive this alert at ${alert.creator.email} any more.`;
};

const getCreatedDateMessage = alert => {
  const createdAt = parseTimestamp(alert.created_at).format("L");
  return t`You created this alert on ${createdAt}.`;
};

const getRecipientsMessage = alert => {
  const emailCount = getRecipientsCount(alert, "email");
  const slackCount = getRecipientsCount(alert, "slack");

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

const getRecipientsCount = (alert, channelType) => {
  return alert.channels
    .filter(channel => channel.channel_type === channelType)
    .reduce((total, channel) => total + channel.recipients.length, 0);
};

export default ArchiveAlertModal;
