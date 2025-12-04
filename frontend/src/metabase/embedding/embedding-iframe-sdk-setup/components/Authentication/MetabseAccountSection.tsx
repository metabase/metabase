import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { Alert, Card, Icon, Radio, Stack, Text } from "metabase/ui";

export const MetabaseAccountSection = () => {
  const { isSsoEnabledAndConfigured, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;

  if (isGuestEmbed) {
    return null;
  }

  const ssoTypeValue = settings.useExistingUserSession ? "user-session" : "sso";

  const handleAuthTypeChange = (value: string) => {
    const useExistingUserSession = value === "user-session";

    updateSettings({ useExistingUserSession });
  };

  return (
    <>
      <Card p="md">
        <Stack gap="md" p="xs">
          <Text size="lg" fw="bold">
            {
              // eslint-disable-next-line no-literal-metabase-strings -- Public Facing string
              t`Metabase account`
            }
          </Text>

          <Radio.Group value={ssoTypeValue} onChange={handleAuthTypeChange}>
            <Stack gap="sm">
              <Radio
                disabled={!isSsoEnabledAndConfigured}
                value="sso"
                label={t`Single sign-on`}
              />

              <Radio
                value="user-session"
                label={t`Existing session (local testing only)`}
              />
            </Stack>
          </Radio.Group>
        </Stack>
      </Card>

      {!isSsoEnabledAndConfigured && !!settings.useExistingUserSession && (
        <Alert icon={<Icon name="warning" size={16} />} color="warning">
          {t`The code below will only work for local testing. To get production ready code, configure JWT SSO or SAML.`}
        </Alert>
      )}
    </>
  );
};
