import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";

const propTypes = {
  onUnsubscribe: PropTypes.func,
  onClose: PropTypes.func,
};

const UnsubscribeAlertModal = ({ onUnsubscribe, onClose }) => {
  return (
    <ModalContent
      title={t`Confirm you want to unsubscribe`}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t`I changed my mind`}
        </Button>,
        <Button key="unsubscribe" warning onClick={onUnsubscribe}>
          {t`Unsubscribe`}
        </Button>,
      ]}
      onClose={onClose}
    >
      <p>
        {t`You’ll stop receiving this alert from now on. Depending on your organization’s permissions you might need to ask a moderator to be re-added in the future.`}
      </p>
    </ModalContent>
  );
};

UnsubscribeAlertModal.propTypes = propTypes;

export default UnsubscribeAlertModal;
