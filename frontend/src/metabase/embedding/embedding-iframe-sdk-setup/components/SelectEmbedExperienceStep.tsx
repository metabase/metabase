import { P, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { ALLOWED_EMBED_SETTING_KEYS_MAP } from "metabase/embedding/embedding-iframe-sdk/constants";
import { UPSELL_CAMPAIGN_EXPERIENCE } from "metabase/embedding/embedding-iframe-sdk-setup/analytics";
import { WithSimpleEmbeddingFeatureUpsellTooltip } from "metabase/embedding/embedding-iframe-sdk-setup/components/warnings/WithSimpleEmbeddingFeatureUpsellTooltip";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Card, Flex, Radio, Stack, Text } from "metabase/ui";

import {
  EMBED_FALLBACK_DASHBOARD_ID,
  EMBED_FALLBACK_QUESTION_ID,
  getEmbedExperiences,
} from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";
import type { SdkIframeEmbedSetupExperience } from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/get-default-sdk-iframe-embed-setting";

export const SelectEmbedExperienceStep = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isGuestEmbedsEnabled,
    initialState,
    experience,
    settings,
    replaceSettings,
    recentDashboards,
    recentQuestions,
  } = useSdkIframeEmbedSetupContext();

  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();

  const handleEmbedExperienceChange = (
    experience: SdkIframeEmbedSetupExperience,
  ) => {
    const persistedSettings = _.pick(
      settings,
      ALLOWED_EMBED_SETTING_KEYS_MAP.base,
    );

    // Use the most recent item for the selected type.
    // If the activity log is completely empty, use the fallback.
    const defaultResourceId = match(experience)
      .with("chart", () => recentQuestions[0]?.id ?? EMBED_FALLBACK_QUESTION_ID)
      .with(
        "dashboard",
        () => recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
      )
      .with(P.union("exploration", "browser", "metabot"), () => 0) // resource id does not apply
      .exhaustive();

    replaceSettings({
      // these settings do not change when the embed type changes
      ...persistedSettings,

      // these settings are overridden when the embed type changes
      ...getDefaultSdkIframeEmbedSettings({
        initialState,
        experience,
        resourceId: defaultResourceId,
        isSimpleEmbedFeatureAvailable,
        isGuestEmbedsEnabled,
      }),
    });
  };

  const experiences = getEmbedExperiences({
    isSimpleEmbedFeatureAvailable,
    isMetabotAvailable,
  });

  return (
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
            <WithSimpleEmbeddingFeatureUpsellTooltip
              key={experience.value}
              mode="custom"
              enableTooltip={experience.showUpsell === true}
              campaign={UPSELL_CAMPAIGN_EXPERIENCE}
            >
              {({ disabled, hoverCard }) => (
                <Radio
                  value={experience.value}
                  label={
                    <Flex gap="xs" align="center">
                      {experience.title}
                      {hoverCard}
                    </Flex>
                  }
                  description={experience.description}
                  disabled={disabled}
                />
              )}
            </WithSimpleEmbeddingFeatureUpsellTooltip>
          ))}
        </Stack>
      </Radio.Group>
    </Card>
  );
};
