import { t } from "ttag";

import { Card, Radio, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../../../context";
import {
  DEFAULT_EXPERIENCE,
  useHandleExperienceChange,
} from "../../../hooks/use-handle-experience-change";
import { getAuthTypeForSettings } from "../../../utils/get-auth-type-for-settings";
import { getResourceTypeFromExperience } from "../../../utils/get-resource-type-from-experience";
import { isQuestionOrDashboardExperience } from "../../../utils/is-question-or-dashboard-experience";
import { isStepWithResource } from "../../../utils/is-step-with-resource";
import { SdkIframeStepEnableEmbeddingSection } from "../../SdkIframeStepEnableEmbeddingSection";

import { DatabaseRoutingWarning } from "./DatabaseRoutingWarning";

export const AuthenticationCard = () => {
  const {
    experience,
    isSimpleEmbedFeatureAvailable,
    currentStep,
    settings,
    updateSettings,
    resource,
  } = useSdkIframeEmbedSetupContext();
  const handleEmbedExperienceChange = useHandleExperienceChange();

  const resourceType = getResourceTypeFromExperience(experience);
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
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- Public Facing string
                t`Metabase account (SSO)`
              }
              disabled={!isSimpleEmbedFeatureAvailable}
            />
          </Stack>
        </Radio.Group>

        {authType === "guest-embed" && resource && resourceType && (
          <DatabaseRoutingWarning
            resource={resource}
            resourceType={resourceType}
          />
        )}

        <SdkIframeStepEnableEmbeddingSection />
      </Stack>
    </Card>
  );
};
