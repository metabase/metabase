import React from "react";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import { FormLink, FormMessage } from "./HelpNotificationModal.styled";

const propTypes = {
  adminEmail: PropTypes.string,
  onClose: PropTypes.func,
};

const HelpNotificationModal = ({ adminEmail, onClose }) => {
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
      <FormMessage>
        {t`It’s possible you may also receive emails from Metabase if you’re a member of an email distribution list, like “team@mycompany.com” and that list is used as the recipient for an alert or dashboard subscription instead of your individual email.`}
      </FormMessage>
      <FormMessage>
        {getAdminMessage(adminEmail)}{" "}
        {t`Hopefully they’ll be able to help you out!`}
      </FormMessage>
    </ModalContent>
  );
};

HelpNotificationModal.propTypes = propTypes;

const getAdminLink = (email, text) => {
  return email ? <FormLink href={`mailto:${email}`}>{text}</FormLink> : text;
};

const getAdminMessage = email => {
  const adminLink = getAdminLink(email, t`your instance administrator`);
  return jt`Metabase doesn’t manage those lists, so we’d recommend contacting ${adminLink}.`;
};

export default HelpNotificationModal;
