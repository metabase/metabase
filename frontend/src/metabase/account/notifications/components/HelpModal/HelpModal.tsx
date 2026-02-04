import { jt, t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ModalContent } from "metabase/common/components/ModalContent";
import { useSelector } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";

import { ModalMessage } from "./HelpModal.styled";

type HelpModalProps = {
  onClose?: (confirmed: boolean) => void;
};

function HelpModal({ onClose }: HelpModalProps): JSX.Element {
  const email = Settings.get("admin-email");
  const applicationName = useSelector(getApplicationName);

  const handleClose = () => onClose?.(true);

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
        {t`It's possible you may also receive emails from ${applicationName} if you're a member of an email distribution list, like "team@mycompany.com" and that list is used as the recipient for an alert or dashboard subscription instead of your individual email.`}
      </ModalMessage>
      <ModalMessage>
        {getAdminMessage(email, applicationName)}
        {t`Hopefully they'll be able to help you out!`}
      </ModalMessage>
    </ModalContent>
  );
}

const getAdminLink = (
  email: string | null | undefined,
  text: string,
): React.ReactNode => {
  return email ? (
    <ExternalLink key="admin-link" href={`mailto:${email}`}>
      {text}
    </ExternalLink>
  ) : (
    text
  );
};

const getAdminMessage = (
  email: string | null | undefined,
  applicationName: string,
): React.ReactNode => {
  const adminLink = getAdminLink(email, t`your instance administrator`);
  return jt`${applicationName} doesn't manage those lists, so we'd recommend contacting ${adminLink}. `;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default HelpModal;
