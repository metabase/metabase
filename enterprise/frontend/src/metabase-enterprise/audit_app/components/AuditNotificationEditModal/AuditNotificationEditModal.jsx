import { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { recipientIsValid } from "metabase/lib/pulse";
import Button from "metabase/core/components/Button";
import FormMessage from "metabase/components/form/FormMessage";
import ModalContent from "metabase/components/ModalContent";
import UserPicker from "metabase/components/UserPicker";
import { ModalErrorMessage } from "metabase-enterprise/audit_app/components/AuditNotificationEditModal/AuditNotificationEditModal.styled";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  users: PropTypes.array.isRequired,
  invalidRecipientText: PropTypes.func.isRequired,
  onUpdate: PropTypes.func,
  onDelete: PropTypes.func,
  onClose: PropTypes.func,
  isAdmin: PropTypes.bool,
};

const AuditNotificationEditModal = ({
  item,
  type,
  users,
  invalidRecipientText,
  isAdmin,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const [channels, setChannels] = useState(item.channels);
  const [error, setError] = useState();
  const domains = MetabaseSettings.subscriptionAllowedDomains().join(", ");
  const recipients = channels.flatMap(c => c.recipients);
  const hasRecipients = recipients.length > 0;
  const hasValidDomains = recipients.every(recipientIsValid);
  const hasValidRecipients = hasRecipients && hasValidDomains;

  const handleRecipientsChange = (recipients, index) => {
    const newChannels = [...channels];
    newChannels[index] = { ...channels[index], recipients };
    setChannels(newChannels);
  };

  const handleUpdateClick = async () => {
    try {
      await onUpdate(item, channels);
      onClose(true);
    } catch (error) {
      setError(error);
    }
  };

  const handleDeleteClick = () => {
    onDelete(item);
  };

  const handleClose = () => onClose(true);

  const modalFooter = [
    error ? <FormMessage key="message" formError={error} /> : null,
    <Button key="delete" borderless onClick={handleDeleteClick}>
      {getDeleteMessage(type)}
    </Button>,
    <Button key="cancel" onClick={handleClose}>
      {t`Cancel`}
    </Button>,
    <Button
      key="update"
      primary
      disabled={!hasValidRecipients}
      onClick={handleUpdateClick}
    >
      {t`Update`}
    </Button>,
  ];

  return (
    <ModalContent
      title={getTitleMessage(item, type)}
      footer={modalFooter}
      onClose={handleClose}
    >
      {channels.map((channel, index) => (
        <UserPicker
          canAddItems={isAdmin}
          key={index}
          value={channel.recipients}
          validateValue={recipientIsValid}
          users={users}
          onChange={recipients => handleRecipientsChange(recipients, index)}
        />
      ))}
      {!hasValidDomains && (
        <ModalErrorMessage>{invalidRecipientText(domains)}</ModalErrorMessage>
      )}
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
