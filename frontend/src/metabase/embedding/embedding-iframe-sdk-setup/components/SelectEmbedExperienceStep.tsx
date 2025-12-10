import { t } from "ttag";

import { AuthenticationSection } from "metabase/embedding/embedding-iframe-sdk-setup/components/Authentication/AuthenticationSection";
import { useHandleExperienceChange } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-handle-experience-change";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Card, Flex, Radio, Stack, Text } from "metabase/ui";

import { getEmbedExperiences } from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";
import type { SdkIframeEmbedSetupExperience } from "../types";

export const SelectEmbedExperienceStep = () => {
  const { isSimpleEmbedFeatureAvailable, experience, settings } =
    useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();

  const handleEmbedExperienceChange = useHandleExperienceChange();

  const experiences = getEmbedExperiences({
    isMetabotAvailable,
  });

  return (
    <>
      <AuthenticationSection />

      <Card p="md" mb="md">
        <Text size="lg" fw="bold" mb="md">
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
      </Card>
    </>
  );
};
