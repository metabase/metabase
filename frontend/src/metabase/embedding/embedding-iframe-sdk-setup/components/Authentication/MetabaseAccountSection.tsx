import { jt, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import {
  SETUP_SSO_CAMPAIGN,
  UTM_LOCATION,
} from "metabase/embedding/embedding-iframe-sdk-setup/analytics";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getAuthSubTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-sub-type-for-settings";
import { Alert, Anchor, Card, Icon, Radio, Stack, Text } from "metabase/ui";

const utmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: SETUP_SSO_CAMPAIGN,
  utm_content: UTM_LOCATION,
};

export const MetabaseAccountSection = () => {
  const { isSsoEnabledAndConfigured, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Only for admins
  const { url: setupSsoUrl } = useDocsUrl("embedding/sdk/authentication", {
    utm: utmTags,
  });

  if (isGuestEmbed) {
    return null;
  }

  const authSubType = getAuthSubTypeForSettings(settings);

  const handleAuthSubTypeChange = (value: string) => {
    const useExistingUserSession = value === "user-session";

    updateSettings({ useExistingUserSession });
  };

  return (
    <>
      <Card p="md">
        <Stack gap="md" p="xs">
          <Text size="lg" fw="bold">
            {
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- Public Facing string
              t`Metabase account`
            }
          </Text>

          <Radio.Group value={authSubType} onChange={handleAuthSubTypeChange}>
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
          <Text size="md" lh="lg">
            {jt`The code below will only work for local testing. To get production ready code, configure ${(
              <Anchor
                key="configure-sso"
                href={setupSsoUrl}
                target="_blank"
                size="md"
                lh="lg"
              >
                {t`JWT SSO or SAML`}
              </Anchor>
            )}.`}
          </Text>
        </Alert>
      )}
    </>
  );
};
