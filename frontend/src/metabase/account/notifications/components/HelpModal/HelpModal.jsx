import React from "react";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import Settings from "metabase/lib/settings";
import { Button } from "metabase/core/components/Button";
import { Link } from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";
import { ModalMessage } from "./HelpModal.styled";

const propTypes = {
  onClose: PropTypes.func,
};

const HelpModal = ({ onClose }) => {
  const email = Settings.get("admin-email");

  const handleClose = () => onClose(true);

  return (
    <ModalContent
      title={t`Not seeing something listed here?`}
      footer={
        <Button key="close" onClick={handleClose}>
          {t`Got it`}
        </Button>
      }
      onClose={handleClose}
    >
      <ModalMessage>
        {t`It’s possible you may also receive emails from Metabase if you’re a member of an email distribution list, like “team@mycompany.com” and that list is used as the recipient for an alert or dashboard subscription instead of your individual email.`}
      </ModalMessage>
      <ModalMessage>
        {getAdminMessage(email)}
        {t`Hopefully they’ll be able to help you out!`}
      </ModalMessage>
    </ModalContent>
  );
};

HelpModal.propTypes = propTypes;

const getAdminLink = (email, text) => {
  return email ? (
    <Link variant="brand" key="admin-link" href={`mailto:${email}`}>
      {text}
    </Link>
  ) : (
    text
  );
};

const getAdminMessage = email => {
  const adminLink = getAdminLink(email, t`your instance administrator`);
  return jt`Metabase doesn’t manage those lists, so we’d recommend contacting ${adminLink}. `;
};

export default HelpModal;
