import PropTypes from "prop-types";
import { jt, t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import { useSelector } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";

import { ModalMessage } from "./HelpModal.styled";

const propTypes = {
  onClose: PropTypes.func,
};

const HelpModal = ({ onClose }) => {
  const email = Settings.get("admin-email");

  const handleClose = () => onClose(true);

  const applicationName = useSelector(getApplicationName);

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
        {t`It’s possible you may also receive emails from ${applicationName} if you’re a member of an email distribution list, like “team@mycompany.com” and that list is used as the recipient for an alert or dashboard subscription instead of your individual email.`}
      </ModalMessage>
      <ModalMessage>
        {getAdminMessage(email, applicationName)}
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

const getAdminMessage = (email, applicationName) => {
  const adminLink = getAdminLink(email, t`your instance administrator`);
  return jt`${applicationName} doesn’t manage those lists, so we’d recommend contacting ${adminLink}. `;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HelpModal;
