import { jt, t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ModalContent } from "metabase/common/components/ModalContent";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Stack } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import Settings from "metabase/utils/settings";

type HelpModalProps = {
  onClose: (confirmed: boolean) => void;
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
      <Stack gap="md">
        <Box>
          {t`It's possible you may also receive emails from ${applicationName} if you're a member of an email distribution list, like "team@mycompany.com" and that list is used as the recipient for an alert or dashboard subscription instead of your individual email.`}
        </Box>
        <Box>
          <AdminMessage email={email} applicationName={applicationName} />
          {t`Hopefully they'll be able to help you out!`}
        </Box>
      </Stack>
    </ModalContent>
  );
}

function AdminLink({
  email,
  text,
}: {
  email: string | null | undefined;
  text: string;
}) {
  return email ? (
    <ExternalLink key="admin-link" href={`mailto:${email}`}>
      {text}
    </ExternalLink>
  ) : (
    <>{text}</>
  );
}

function AdminMessage({
  email,
  applicationName,
}: {
  email: string | null | undefined;
  applicationName: string;
}) {
  const adminLink = (
    <AdminLink
      key="admin-link"
      email={email}
      text={t`your instance administrator`}
    />
  );
  return jt`${applicationName} doesn't manage those lists, so we'd recommend contacting ${adminLink}. `;
}

export { HelpModal };
