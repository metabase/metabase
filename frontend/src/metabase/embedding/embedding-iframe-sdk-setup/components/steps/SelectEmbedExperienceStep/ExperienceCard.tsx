import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/types";
import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { Card, Flex, Radio, Stack, Text } from "metabase/ui";

import { getEmbedExperiences } from "../../../constants";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { useHandleExperienceChange } from "../../../hooks/use-handle-experience-change";
import { hasAuthToSelect } from "../../../utils/has-auth-to-select";
import { SetupSsoAlert } from "../../Common/SetupSsoAlert";

export const ExperienceCard = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isSsoEnabledAndConfigured,
    experience,
    settings,
    initialState,
  } = useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;
  const isDataAppsAvailable = useHasTokenFeature("data-apps");
  const isMetabotAvailable = useMetabotEnabledEmbeddingAware({
    forceEmbedding: true,
  });

  const handleEmbedExperienceChange = useHandleExperienceChange();

  const experiences = getEmbedExperiences({
    isMetabotAvailable,
    isDataAppsAvailable,
  });

  // The wizard opened from a data app in Data Studio embeds only that app,
  // so we do not let the user switch to other embed experiences.
  const showExperienceSelector = initialState?.resourceType !== "data-app";

  const showSsoNotConfiguredWarning =
    !isSsoEnabledAndConfigured && !hasAuthToSelect(experience);

  if (!showExperienceSelector && !showSsoNotConfiguredWarning) {
    return null;
  }

  return (
    <Card p="lg">
      <Stack gap="lg">
        {showExperienceSelector && (
          <>
            <Text size="lg" fw="bold">
              {t`Select your embed experience`}
            </Text>

            <Radio.Group
              value={experience}
              onChange={(experience) =>
                handleEmbedExperienceChange(
                  // Unjustified type cast. FIXME
                  experience as SdkIframeEmbedSetupExperience,
                )
              }
            >
              <Stack gap="lg">
                {experiences.map((experience) => (
                  <Radio
                    key={experience.value}
                    value={experience.value}
                    label={
                      <Flex gap="xxs" align="center">
                        {experience.title}
                      </Flex>
                    }
                    description={experience.description}
                    disabled={
                      (!experience.supportsOss &&
                        !isSimpleEmbedFeatureAvailable) ||
                      (!experience.supportsGuestEmbed &&
                        isGuestEmbed &&
                        experience.value !== "data-app")
                    }
                  />
                ))}
              </Stack>
            </Radio.Group>
          </>
        )}

        {showSsoNotConfiguredWarning && (
          <SetupSsoAlert
            variant={experience === "data-app" ? "data-app" : "local-testing"}
          />
        )}
      </Stack>
    </Card>
  );
};
