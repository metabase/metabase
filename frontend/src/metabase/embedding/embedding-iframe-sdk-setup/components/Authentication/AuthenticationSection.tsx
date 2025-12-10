import type { ReactNode } from "react";
import { t } from "ttag";

import { TooltipWarning } from "metabase/embedding/embedding-iframe-sdk-setup/components/Common/TooltipWarning";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import {
  DEFAULT_EXPERIENCE,
  useHandleExperienceChange,
} from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-handle-experience-change";
import { getAuthTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-type-for-settings";
import { Card, Radio, Stack, Text } from "metabase/ui";

export const AuthenticationSection = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isFirstStep,
    settings,
    updateSettings,
  } = useSdkIframeEmbedSetupContext();
  const handleEmbedExperienceChange = useHandleExperienceChange();

  if (!isFirstStep) {
    return null;
  }

  const authType = getAuthTypeForSettings(settings);

  const handleAuthTypeChange = (value: string) => {
    const isGuest = value === "guest-embed";
    const isSso = value === "sso";

    if (isGuest) {
      // Reset experience to default when switching to guest embeds
      handleEmbedExperienceChange(DEFAULT_EXPERIENCE);
    }

    updateSettings({
      isGuest,
      isSso,
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

            <Radio
              value="sso"
              label={
                // eslint-disable-next-line no-literal-metabase-strings -- Public Facing string
                t`Metabase account (SSO)`
              }
              disabled={!isSimpleEmbedFeatureAvailable}
            />
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
      tooltip={t`Disabled in the admin settings`}
      disabled={disabled}
    >
      {children}
    </TooltipWarning>
  );
};
