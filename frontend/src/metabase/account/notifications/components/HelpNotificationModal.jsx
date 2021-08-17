import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";

const propTypes = {
  onClose: PropTypes.func,
};

const HelpNotificationModal = ({ onClose }) => {
  return (
    <ModalContent
      title={t`Not seeing something listed here?`}
      footer={
        <Button key="close" onClick={onClose}>
          {t`Got it`}
        </Button>
      }
      onClose={onClose}
    >
      <p>
        {t`It's possible you may also receive emails from Metabase if you’re a member of an email distribution list, like “team@mycompany.com” and that list is used as the recipient for an alert or dashboard subscription instead of your individual email.`}
      </p>
      <p>
        {t`Metabase doesn't manage those lists, so we’d recommend contacting your instance administrator. Hopefully they'll be able to help you out!`}
      </p>
    </ModalContent>
  );
};

HelpNotificationModal.propTypes = propTypes;

export default HelpNotificationModal;
