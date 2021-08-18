import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  onUnsubscribe: PropTypes.func,
  onClose: PropTypes.func,
};

const UnsubscribeNotificationModal = ({
  item,
  type,
  onUnsubscribe,
  onClose,
}) => {
  const handleUnsubscribe = useCallback(async () => {
    await onUnsubscribe(item);
    onClose();
  }, [item, onUnsubscribe, onClose]);

  return (
    <ModalContent
      title={t`Confirm you want to unsubscribe`}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t`I changed my mind`}
        </Button>,
        <Button key="unsubscribe" warning onClick={handleUnsubscribe}>
          {t`Unsubscribe`}
        </Button>,
      ]}
      onClose={onClose}
    >
      <p>
        {getUnsubscribeMessage(type)}{" "}
        {t`Depending on your organization’s permissions you might need to ask a moderator to be re-added in the future.`}
      </p>
    </ModalContent>
  );
};

UnsubscribeNotificationModal.propTypes = propTypes;

const getUnsubscribeMessage = type => {
  switch (type) {
    case "alert":
      return t`You’ll stop receiving this alert from now on.`;
    case "pulse":
      return t`You’ll stop receiving this subscription from now on.`;
  }
};

export default UnsubscribeNotificationModal;
