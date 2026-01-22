import { t } from "ttag";

import { SdkIframeStepEnableEmbeddingSection } from "metabase/embedding/embedding-iframe-sdk-setup/components/SdkIframeStepEnableEmbeddingSection";
import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import {
  DEFAULT_EXPERIENCE,
  useHandleExperienceChange,
} from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-handle-experience-change";
import { getAuthTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-type-for-settings";
import { isQuestionOrDashboardExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-question-or-dashboard-experience";
import { isStepWithResource } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-step-with-resource";
import { Card, Radio, Stack, Text } from "metabase/ui";

export const AuthenticationSection = () => {
  const {
    experience,
    isSimpleEmbedFeatureAvailable,
    isFirstStep,
    currentStep,
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

    // Reset experience to default when switching to guest embeds from non-supported experience
    const shouldSwitchExperience =
      isGuest &&
      !isStepWithResource(currentStep) &&
      !isQuestionOrDashboardExperience(experience);

    if (shouldSwitchExperience) {
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
            <Radio value="guest-embed" label={t`Guest`} />

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

        <SdkIframeStepEnableEmbeddingSection />
      </Stack>
    </Card>
  );
};
