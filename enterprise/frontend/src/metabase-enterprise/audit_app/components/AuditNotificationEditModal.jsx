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
  onClose: PropTypes.func,
};

const AuditNotificationEditModal = ({
  item,
  type,
  users,
  onUpdate,
  onClose,
}) => {
  const [channels, setChannels] = useState(item.channels);
  const [error, setError] = useState();

  const handleUpdateClick = async () => {
    try {
      await onUpdate(item, channels);
      onClose();
    } catch (error) {
      setError(error);
    }
  };

  const handleRecipientsChange = (recipients, index) => {
    const newChannels = [...channels];
    newChannels[index] = { ...channels[index], recipients };

    setChannels(newChannels);
  };

  return (
    <ModalContent
      title={getTitleMessage(item, type)}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>
          {t`Cancel`}
        </Button>,
        <Button key="update" primary onClick={handleUpdateClick}>
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
          onChange={handleRecipientsChange}
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

export default AuditNotificationEditModal;
