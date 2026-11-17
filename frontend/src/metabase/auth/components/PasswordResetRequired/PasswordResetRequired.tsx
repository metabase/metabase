import { type JSX, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useDispatch, useSelector } from "metabase/redux";
import { forgotPassword } from "metabase/redux/auth";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useSetting } from "metabase/settings";
import { Box, Button, Stack, Text, Title } from "metabase/ui";

interface PasswordResetRequiredProps {
  email: string;
  onCancel: () => void;
}

/**
 * Shown at sign-in in place of a session when an admin has forced the user to set a new password. Offers to email
 * them a reset link, or tells them to ask an admin when email can't be sent.
 */
export const PasswordResetRequired = ({
  email,
  onCancel,
}: PasswordResetRequiredProps): JSX.Element => {
  const isEmailConfigured = useSetting("email-configured?");
  const isLdapEnabled = useSetting("ldap-enabled");
  const canEmailResetLink = isEmailConfigured && !isLdapEnabled;
  const applicationName = useSelector(getApplicationName);
  const dispatch = useDispatch();
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleSendResetLink = async () => {
    setIsSending(true);
    setErrorMessage(undefined);
    try {
      await dispatch(forgotPassword(email)).unwrap();
      setIsSent(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Stack align="center" gap="lg">
      <Title order={1} size="h3" c="text-primary" ta="center">
        {t`You need to set a new password`}
      </Title>
      <Box c="text-primary" ta="center">
        {t`An administrator has required you to set a new password before you can use ${applicationName} again. Your current password won't work anymore.`}
      </Box>
      <ResetLinkAction
        email={email}
        canEmailResetLink={canEmailResetLink}
        isSending={isSending}
        isSent={isSent}
        onSend={handleSendResetLink}
      />
      {errorMessage && <Text c="feedback-negative">{errorMessage}</Text>}
      <Button variant="subtle" onClick={onCancel}>{t`Back to sign in`}</Button>
    </Stack>
  );
};

interface ResetLinkActionProps {
  email: string;
  canEmailResetLink: boolean;
  isSending: boolean;
  isSent: boolean;
  onSend: () => void;
}

const ResetLinkAction = ({
  email,
  canEmailResetLink,
  isSending,
  isSent,
  onSend,
}: ResetLinkActionProps): JSX.Element => {
  if (isSent) {
    return (
      <Box c="text-primary" ta="center">
        {t`We've sent a link to ${email}. Follow it to set your new password.`}
      </Box>
    );
  }

  if (!canEmailResetLink) {
    return (
      <Box c="text-primary" ta="center">
        {t`Ask an administrator to share a password reset link with you.`}
      </Box>
    );
  }

  return (
    <Button variant="filled" loading={isSending} onClick={onSend}>
      {t`Email me a reset link`}
    </Button>
  );
};
