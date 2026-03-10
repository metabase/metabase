/* eslint-disable metabase/no-literal-metabase-strings */

import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { useHelpUrl } from "metabase/embedding/embedding-hub/hooks";
import { Button, Group, Stack, Text, Title } from "metabase/ui";

const SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

export const TestJwtStep = () => {
  const [sendToast] = useToast();
  const [updateSettings] = useUpdateSettingsMutation();

  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  const onDone = async () => {
    try {
      await updateSettings({
        "embedding-hub-sso-auth-manual-tested": true,
      }).unwrap();
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`Failed to save SSO test status`,
      });
    }
  };

  if (showTroubleshooting) {
    return <SsoTroubleshootingView onDone={onDone} />;
  }

  return (
    <Stack gap="lg">
      <Title order={3}>{t`Try logging in with SSO. Did it work?`}</Title>

      <Text size="md" c="text-secondary" lh="lg">
        {t`To check if JWT authentication was configured successfully, open Metabase in a different browser or in a private tab and try logging in to your account using single sign-on (SSO). Is login working correctly?`}
      </Text>

      <Group justify="flex-end">
        <Button variant="outline" onClick={() => setShowTroubleshooting(true)}>
          {t`No, I couldn't log in`}
        </Button>

        <Button
          component={Link}
          to={SETUP_GUIDE_PATH}
          variant="filled"
          onClick={onDone}
        >
          {t`Log in works, I'm done`}
        </Button>
      </Group>
    </Stack>
  );
};

const SsoTroubleshootingView = ({ onDone }: { onDone: () => void }) => {
  const helpUrl = useHelpUrl();

  return (
    <Stack gap="lg">
      <Title order={3}>{t`Troubleshooting`}</Title>

      <Text size="md" c="text-secondary" lh="lg">
        {t`Try the steps below before testing JWT authentication again. If nothing works, consider contacting support.`}
      </Text>

      <Stack gap="md">
        <div>
          <Text fw={700} mb="xs">{t`404 error after SSO sign-in`}</Text>

          <Text size="md" c="text-secondary" lh="lg">
            {t`If after clicking on "Sign in with SSO", the browser returns a 404 error, make sure the value of the JWT SSO URI in admin settings / auth / JWT is pointing to your endpoint and your endpoint is up and running and available.`}
          </Text>
        </div>

        <div>
          <Text
            fw={700}
            mb="xs"
          >{t`JWT decryption error: "Message seems corrupt"`}</Text>

          <Text size="md" c="text-secondary" lh="lg">
            {t`If after being redirected from your app to Metabase, you see "Message seems corrupt or manipulated" there was an issue decrypting signed JWT. Ensure METABASE_JWT_SHARED_SECRET has the right value.`}
          </Text>
        </div>

        <div>
          <Text fw={700} mb="xs">{t`Tenant ID mismatch error`}</Text>

          <Text size="md" c="text-secondary" lh="lg">
            {t`If after being redirected from your app to Metabase, you see an error message "Tenant ID mismatch with existing user", your application is trying to sign in a the user with the wrong tenant slug. Review @tenant claim in the JWT and ensure it matches the tenant this tenant user belongs to.`}
          </Text>
        </div>

        <div>
          <Text
            fw={700}
            mb="xs"
          >{t`User provisioning disabled for JWT SSO`}</Text>

          <Text size="md" c="text-secondary" lh="lg">
            {t`If after being redirected from your app to Metabase, you see an error message "Sorry, but you'll need a $SITENAME account to view this page, contact your administrator. User provisioning is turned off for JWT SSO in admin settings/authentication. Either turn this feature on to have users be provisioned if they don't exist yet, or ensure users exist before signing them in via JWT SSO.`}
          </Text>
        </div>
      </Stack>

      <Group justify="flex-end">
        <Button component="a" href={helpUrl} target="_blank" variant="outline">
          {t`Contact customer support`}
        </Button>

        <Button
          component={Link}
          to={SETUP_GUIDE_PATH}
          variant="filled"
          onClick={onDone}
        >
          {t`Log in works, I'm done`}
        </Button>
      </Group>
    </Stack>
  );
};
