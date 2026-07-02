import { t } from "ttag";

import { Card, Radio, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../../context";
import { getAuthTypeForSettings } from "../../utils/get-auth-type-for-settings";
import { getResourceTypeFromExperience } from "../../utils/get-resource-type-from-experience";
import { SetupSsoAlert } from "../Common/SetupSsoAlert";
import { DatabaseRoutingWarning } from "../DatabaseRoutingWarning";

import { EnableGuestEmbedsSection } from "./EnableGuestEmbedsSection";
import { EnableModularEmbeddingSection } from "./EnableModularEmbeddingSection";

/**
 * Authentication step of the embed setup wizard: lets the admin pick SSO or
 * Guest auth, and surfaces the matching "enable + accept terms" CTA under the
 * selected option.
 */
export const AuthenticationCard = () => {
  const {
    experience,
    isSimpleEmbedFeatureAvailable,
    isSsoEnabledAndConfigured,
    currentStep,
    settings,
    updateSettings,
    resource,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
    isGuestEmbedsEnabled,
    isGuestEmbedsTermsAccepted,
  } = useSdkIframeEmbedSetupContext();

  const resourceType = getResourceTypeFromExperience(experience);
  const authType = getAuthTypeForSettings(settings);

  const showSsoNotConfiguredWarning =
    !isSsoEnabledAndConfigured && authType === "sso";

  const handleAuthTypeChange = (value: string) => {
    updateSettings({
      isGuest: value === "guest-embed",
      isSso: value === "sso",
    });
  };

  return (
    <Card p="md">
      <Stack gap="md" p="xs">
        <Text size="lg" fw="bold">
          {t`Authentication`}
        </Text>

        <Radio.Group value={authType} onChange={handleAuthTypeChange}>
          <Stack gap="md">
            <Stack gap="sm">
              <Radio
                value="sso"
                label={
                  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Public Facing string
                  t`Metabase account (SSO)`
                }
                disabled={!isSimpleEmbedFeatureAvailable}
              />
              {authType === "sso" &&
                isSimpleEmbedFeatureAvailable &&
                isSimpleEmbeddingEnabled !== undefined && (
                  <EnableModularEmbeddingSection
                    key={currentStep}
                    isEnabled={isSimpleEmbeddingEnabled}
                    termsAccepted={isSimpleEmbeddingTermsAccepted}
                  />
                )}
            </Stack>

            <Stack gap="sm">
              <Radio value="guest-embed" label={t`Guest`} />
              {authType === "guest-embed" && (
                <>
                  {resource && resourceType && (
                    <DatabaseRoutingWarning
                      resource={resource}
                      resourceType={resourceType}
                    />
                  )}
                  {isGuestEmbedsEnabled !== undefined && (
                    <EnableGuestEmbedsSection
                      key={currentStep}
                      isEnabled={isGuestEmbedsEnabled}
                      termsAccepted={isGuestEmbedsTermsAccepted}
                    />
                  )}
                </>
              )}
            </Stack>
          </Stack>
        </Radio.Group>

        {showSsoNotConfiguredWarning && <SetupSsoAlert />}
      </Stack>
    </Card>
  );
};
