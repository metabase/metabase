import { t } from "ttag";
import _ from "underscore";

import { Card, Radio, Stack, Text } from "metabase/ui";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { EMBED_TYPES } from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";
import type { SdkIframeEmbedSetupType } from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/default-embed-setting";

export const SelectEmbedTypeStep = () => {
  const { embedType, settings, setSettings } = useSdkIframeEmbedSetupContext();

  const handleEmbedTypeChange = (type: SdkIframeEmbedSetupType) => {
    const persistedSettings = _.pick(settings, [
      "theme",
      "instanceUrl",
      "apiKey",
    ]);

    // TODO(EMB-508): use the most recent question or dashboard.
    const defaultEntityId = 1;

    setSettings({
      // clear other entity types
      template: undefined,
      questionId: undefined,
      dashboardId: undefined,

      // these settings do not change when the embed type changes
      ...persistedSettings,

      // these settings are overridden when the embed type changes
      ...getDefaultSdkIframeEmbedSettings(type, defaultEntityId),
    } as SdkIframeEmbedSettings);
  };

  return (
    <Card p="md" mb="md">
      <Text size="lg" fw="bold" mb="md">
        {t`Select your embed experience`}
      </Text>

      <Radio.Group
        value={embedType}
        onChange={(value) =>
          handleEmbedTypeChange(value as SdkIframeEmbedSetupType)
        }
      >
        <Stack gap="md">
          {EMBED_TYPES.map((type) => (
            <Radio
              key={type.value}
              value={type.value}
              label={type.title}
              description={type.description}
            />
          ))}
        </Stack>
      </Radio.Group>
    </Card>
  );
};
