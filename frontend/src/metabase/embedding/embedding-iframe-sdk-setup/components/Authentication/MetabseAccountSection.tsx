import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getAuthTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-type-for-settings";
import { Card, Radio, Stack, Text } from "metabase/ui";

export const MetabaseAccountSection = () => {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;

  const isJwtEnabled = useSetting("jwt-enabled");
  const isSamlEnabled = useSetting("saml-enabled");
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  if (isGuestEmbed) {
    return null;
  }

  const isSsoEnabledAndConfigured =
    (isJwtEnabled && isJwtConfigured) || (isSamlEnabled && isSamlConfigured);

  const authType = getAuthTypeForSettings(settings);

  const handleAuthTypeChange = (value: string) => {
    const useExistingUserSession = value === "user-session";

    updateSettings({ useExistingUserSession });
  };

  return (
    <Card p="md">
      <Stack gap="md" p="xs">
        <Text size="lg" fw="bold">
          {
            // eslint-disable-next-line no-literal-metabase-strings -- Public Facing string
            t`Metabase account`
          }
        </Text>

        <Radio.Group value={authType} onChange={handleAuthTypeChange}>
          <Stack gap="sm">
            <Radio
              disabled={!isSsoEnabledAndConfigured}
              value="sso"
              label={t`Single sign-on`}
            />

            <Radio
              value="sso"
              label={t`Existing session (local testing only)`}
            />
          </Stack>
        </Radio.Group>
      </Stack>
    </Card>
  );
};
