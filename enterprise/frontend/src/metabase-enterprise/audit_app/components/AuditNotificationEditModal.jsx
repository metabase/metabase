import React, { Fragment, useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/components/Button";
import FormMessage from "metabase/components/form/FormMessage";
import ModalContent from "metabase/components/ModalContent";
import TokenField from "metabase/components/TokenField";

const propTypes = {
  item: PropTypes.object,
  type: PropTypes.oneOf(["alert", "pulse"]),
  onUpdate: PropTypes.func,
  onDelete: PropTypes.func,
  onClose: PropTypes.func,
};

const AuditNotificationEditModal = ({
  item,
  type,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const [channels, setChannels] = useState(item.channels);
  const [error, setError] = useState();

  const handleUpdateClick = useCallback(async () => {
    try {
      await onUpdate(item, channels);
      onClose();
    } catch (error) {
      setError(error);
    }
  }, [item, channels, onUpdate, onClose]);

  const handleDeleteClick = useCallback(async () => {
    onDelete(item);
  }, [item, onDelete]);

  const handleRecipientsChange = useCallback(
    (recipients, index) => {
      const newChannels = [...channels];
      newChannels[index] = { ...channels[index], recipients };

      setChannels(newChannels);
    },
    [channels],
  );

  return (
    <ModalContent
      title={getTitleMessage(item, type)}
      footer={
        <Fragment>
          <Button danger onClick={handleDeleteClick}>
            {t`Delete`}
          </Button>
          {error ? <FormMessage key="message" formError={error} /> : null}
          <Button onClick={onClose}>{t`Cancel`}</Button>,
          <Button
            primary
            disabled={!channels.length}
            onClick={handleUpdateClick}
          >
            {t`Update`}
          </Button>
        </Fragment>
      }
      onClose={onClose}
    >
      {channels.map((channel, index) => (
        <TokenField
          key={index}
          value={channel.recipients}
          valueRenderer={value => value.common_name || value.email}
          multi
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

export default AuditNotificationEditModal;
