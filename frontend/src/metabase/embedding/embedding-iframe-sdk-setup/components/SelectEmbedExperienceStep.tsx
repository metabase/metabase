import { t } from "ttag";

import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { Card, Radio, Stack, Text } from "metabase/ui";

import { UPSELL_CAMPAIGN_EXPERIENCE } from "../analytics";
import { getEmbedExperiences } from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";
import { useHandleExperienceChange } from "../hooks/use-handle-experience-change";
import type { SdkIframeEmbedSetupExperience } from "../types";

import { EmbeddingUpsell } from "./Common/EmbeddingUpsell";

export const SelectEmbedExperienceStep = () => {
  const { isSimpleEmbedFeatureAvailable, experience, settings } =
    useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;
  const isMetabotAvailable = useMetabotEnabledEmbeddingAware({
    forceEmbedding: true,
  });

  const handleEmbedExperienceChange = useHandleExperienceChange();

  const experiences = getEmbedExperiences({
    isMetabotAvailable,
  });

  return (
    <>
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
            {experiences.map((experience) => {
              const disabledForOss =
                !experience.supportsOss && !isSimpleEmbedFeatureAvailable;
              const disabled =
                disabledForOss ||
                (!experience.supportsGuestEmbed && isGuestEmbed);

              return (
                <Radio
                  key={experience.value}
                  value={experience.value}
                  label={experience.title}
                  description={experience.description}
                  disabled={disabled}
                />
              );
            })}
          </Stack>
        </Radio.Group>
      </Card>

      <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_EXPERIENCE} />
    </>
  );
};
