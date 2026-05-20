import { t } from "ttag";

import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { Card, Flex, Radio, Stack, Text } from "metabase/ui";

import { getEmbedExperiences } from "../../../constants";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { useHandleExperienceChange } from "../../../hooks/use-handle-experience-change";
import type { SdkIframeEmbedSetupExperience } from "../../../types";
import { hasAuthToSelect } from "../../../utils/has-auth-to-select";
import { SetupSsoAlert } from "../../Common/SetupSsoAlert";

export const ExperienceCard = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isSsoEnabledAndConfigured,
    experience,
    settings,
  } = useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;
  const isMetabotAvailable = useMetabotEnabledEmbeddingAware({
    forceEmbedding: true,
  });

  const handleEmbedExperienceChange = useHandleExperienceChange();

  const experiences = getEmbedExperiences({
    isMetabotAvailable,
  });

  const showSsoNotConfiguredWarning =
    !isSsoEnabledAndConfigured && !hasAuthToSelect(experience);

  return (
    <Card p="md">
      <Stack gap="md">
        <Text size="lg" fw="bold">
          {t`Select your embed experience`}
        </Text>

        <Radio.Group
          value={experience}
          onChange={(experience) =>
            handleEmbedExperienceChange(
              experience as SdkIframeEmbedSetupExperience,
            )
          }
        >
          <Stack gap="md">
            {experiences.map((experience) => (
              <Radio
                key={experience.value}
                value={experience.value}
                label={
                  <Flex gap="xs" align="center">
                    {experience.title}
                  </Flex>
                }
                description={experience.description}
                disabled={
                  (!experience.supportsOss && !isSimpleEmbedFeatureAvailable) ||
                  (!experience.supportsGuestEmbed && isGuestEmbed)
                }
              />
            ))}
          </Stack>
        </Radio.Group>

        {showSsoNotConfiguredWarning && <SetupSsoAlert />}
      </Stack>
    </Card>
  );
};
