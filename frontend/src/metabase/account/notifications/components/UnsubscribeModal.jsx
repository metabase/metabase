import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import FormMessage from "metabase/components/form/FormMessage";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  user: PropTypes.object.isRequired,
  onUnsubscribe: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const UnsubscribeModal = ({ item, type, user, onUnsubscribe, onClose }) => {
  const [error, setError] = useState();

  const handleArchiveClick = useCallback(async () => {
    try {
      await onUnsubscribe(item, user);
      onClose();
    } catch (error) {
      setError(error);
    }
  }, [item, user, onUnsubscribe, onClose]);

  return (
    <ModalContent
      title={t`Confirm you want to unsubscribe`}
      footer={[
        error ? <FormMessage formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>
          {t`I changed my mind`}
        </Button>,
        <Button key="unsubscribe" warning onClick={handleArchiveClick}>
          {t`Unsubscribe`}
        </Button>,
      ]}
      onClose={onClose}
    >
      <p>
        {getUnsubscribeMessage(type)}
        {t`Depending on your organization’s permissions you might need to ask a moderator to be re-added in the future.`}
      </p>
    </ModalContent>
  );
};

UnsubscribeModal.propTypes = propTypes;

const getUnsubscribeMessage = type => {
  switch (type) {
    case "alert":
      return t`You’ll stop receiving this alert from now on. `;
    case "pulse":
      return t`You’ll stop receiving this subscription from now on. `;
  }
};

export default UnsubscribeModal;
