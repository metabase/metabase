import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/components/Button";
import FormMessage from "metabase/components/form/FormMessage";
import ModalContent from "metabase/components/ModalContent";
import UserPicker from "metabase/components/UserPicker";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  users: PropTypes.array.isRequired,
  onUpdate: PropTypes.func,
  onDelete: PropTypes.func,
  onClose: PropTypes.func,
};

const AuditNotificationEditModal = ({
  item,
  type,
  users,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const [channels, setChannels] = useState(item.channels);
  const [error, setError] = useState();
  const hasRecipients = channels.some(c => c.recipients.length > 0);

  const handleRecipientsChange = (recipients, index) => {
    const newChannels = [...channels];
    newChannels[index] = { ...channels[index], recipients };
    setChannels(newChannels);
  };

  const handleUpdateClick = async () => {
    try {
      await onUpdate(item, channels);
      onClose();
    } catch (error) {
      setError(error);
    }
  };

  const handleDeleteClick = () => {
    onDelete(item);
  };

  return (
    <ModalContent
      title={getTitleMessage(item, type)}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="delete" borderless onClick={handleDeleteClick}>
          {getDeleteMessage(type)}
        </Button>,
        <Button key="cancel" onClick={onClose}>
          {t`Cancel`}
        </Button>,
        <Button
          key="update"
          primary
          disabled={!hasRecipients}
          onClick={handleUpdateClick}
        >
          {t`Update`}
        </Button>,
      ]}
      onClose={onClose}
    >
      {channels.map((channel, index) => (
        <UserPicker
          key={index}
          value={channel.recipients}
          users={users}
          onChange={recipients => handleRecipientsChange(recipients, index)}
        />
      ))}
    </ModalContent>
  );
};

AuditNotificationEditModal.propTypes = propTypes;

const getTitleMessage = (item, type) => {
  switch (type) {
    case "alert":
      return t`${item.card.name} alert recipients`;
    case "pulse":
      return t`${item.name} recipients`;
  }
};

const getDeleteMessage = type => {
  switch (type) {
    case "alert":
      return t`Delete this alert`;
    case "pulse":
      return t`Delete this subscription`;
  }
};

export default AuditNotificationEditModal;
