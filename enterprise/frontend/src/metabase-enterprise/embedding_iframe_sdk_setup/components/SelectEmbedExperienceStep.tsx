import { t } from "ttag";
import _ from "underscore";

import { Card, Radio, Stack, Text } from "metabase/ui";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { EMBED_EXPERIENCES } from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";
import type { SdkIframeEmbedSetupExperience } from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/default-embed-setting";

export const SelectEmbedExperienceStep = () => {
  const { experience, settings, setSettings } = useSdkIframeEmbedSetupContext();

  const handleEmbedExperienceChange = (
    experience: SdkIframeEmbedSetupExperience,
  ) => {
    const persistedSettings = _.pick(settings, [
      "theme",
      "instanceUrl",
      "apiKey",
    ]);

    // TODO(EMB-508): use the most recent question or dashboard.
    const defaultEntityId = 1;

    setSettings({
      // these settings do not change when the embed type changes
      ...persistedSettings,

      // these settings are overridden when the embed type changes
      ...getDefaultSdkIframeEmbedSettings(experience, defaultEntityId),
    } as SdkIframeEmbedSettings);
  };

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
          {EMBED_EXPERIENCES.map((experience) => (
            <Radio
              key={experience.value}
              value={experience.value}
              label={experience.title}
              description={experience.description}
            />
          ))}
        </Stack>
      </Radio.Group>
    </Card>
  );
};
