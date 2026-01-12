import { t } from "ttag";

import { PLUGIN_METABOT } from "metabase/plugins";
import { Card, Flex, Radio, Stack, Text } from "metabase/ui";

import { UPSELL_CAMPAIGN_EXPERIENCE } from "../analytics";
import { getEmbedExperiences } from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";
import { useHandleExperienceChange } from "../hooks/use-handle-experience-change";
import type { SdkIframeEmbedSetupExperience } from "../types";

import { AuthenticationSection } from "./Authentication/AuthenticationSection";
import { EmbeddingUpsell } from "./Common/EmbeddingUpsell";

export const SelectEmbedExperienceStep = () => {
  const { isSimpleEmbedFeatureAvailable, experience, settings } =
    useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;
  const handleEmbedExperienceChange = useHandleExperienceChange();

  const experiences = getEmbedExperiences({
    isOmniMetabotAvailable: PLUGIN_METABOT.isOmnibotEnabled(),
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

      <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_EXPERIENCE} />
    </>
  );
};
