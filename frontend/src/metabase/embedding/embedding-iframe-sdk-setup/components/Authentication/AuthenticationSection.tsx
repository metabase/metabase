import type { ReactNode } from "react";
import { t } from "ttag";

import { UPSELL_CAMPAIGN_AUTH } from "metabase/embedding/embedding-iframe-sdk-setup/analytics";
import { TooltipWarning } from "metabase/embedding/embedding-iframe-sdk-setup/components/warnings/TooltipWarning";
import { WithSimpleEmbeddingFeatureUpsellTooltip } from "metabase/embedding/embedding-iframe-sdk-setup/components/warnings/WithSimpleEmbeddingFeatureUpsellTooltip";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import { getAuthTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-type-for-settings";
import { Card, Radio, Stack, Text } from "metabase/ui";

export const AuthenticationSection = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isFirstStep,
    settings,
    updateSettings,
  } = useSdkIframeEmbedSetupContext();

  if (!isFirstStep) {
    return null;
  }

  const authType = getAuthTypeForSettings(settings);

  const handleAuthTypeChange = (value: string) => {
    const isGuest = value === "guest-embed";
    const useExistingUserSession = value === "user-session";

    updateSettings({
      isGuest,
      useExistingUserSession,
    });
  };

  return (
    <Card p="md">
      <Stack gap="md" p="xs">
        <Text size="lg" fw="bold">
          {t`Authentication`}
        </Text>

        <Radio.Group value={authType} onChange={handleAuthTypeChange}>
          <Stack gap="sm">
            <WithGuestEmbedsDisabledWarning>
              {({ disabled }) => (
                <Radio
                  disabled={disabled}
                  value="guest-embed"
                  label={t`Guest`}
                />
              )}
            </WithGuestEmbedsDisabledWarning>

            <WithSimpleEmbeddingFeatureUpsellTooltip
              enableTooltip={!isSimpleEmbedFeatureAvailable}
              campaign={UPSELL_CAMPAIGN_AUTH}
            >
              {({ disabled }) => (
                <Radio
                  value="sso"
                  label={
                    // eslint-disable-next-line no-literal-metabase-strings -- Public Facing string
                    t`Metabase account (SSO)`
                  }
                  disabled={disabled}
                />
              )}
            </WithSimpleEmbeddingFeatureUpsellTooltip>
          </Stack>
        </Radio.Group>
      </Stack>
    </Card>
  );
};

const WithGuestEmbedsDisabledWarning = ({
  children,
}: {
  children: (data: { disabled: boolean }) => ReactNode;
}) => {
  const { isGuestEmbedsEnabled } = useSdkIframeEmbedSetupContext();

  const disabled = !isGuestEmbedsEnabled;

  return (
    <TooltipWarning
      warning={
        <Text lh="md" p="md">
          {t`Disabled in the admin settings`}
        </Text>
      }
      disabled={disabled}
    >
      {children}
    </TooltipWarning>
  );
};
