import React from "react";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";
import { HelpMessage } from "./AdminHelpModal.styled";

const propTypes = {
  adminEmail: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

const AdminHelpModal = ({ adminEmail, onClose }) => {
  const adminLink = getEmailLink(adminEmail, t`your instance administrator`);

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
      <HelpMessage>
        {t`It’s possible you may also receive emails from Metabase if you’re a member of an email distribution list, like “team@mycompany.com” and that list is used as the recipient for an alert or dashboard subscription instead of your individual email.`}
      </HelpMessage>
      <HelpMessage>
        {jt`Metabase doesn’t manage those lists, so we’d recommend contacting ${adminLink}. Hopefully they’ll be able to help you out!`}
      </HelpMessage>
    </ModalContent>
  );
};

AdminHelpModal.propTypes = propTypes;

const getEmailLink = (email, text) => {
  return email ? <a href={`mailto:${email}`}>{text}</a> : text;
};

export default AdminHelpModal;
