import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { Card, Radio, Stack, Text } from "metabase/ui";

import { EMBED_TYPES } from "../constants";
import type { SdkIframeEmbedSetupType } from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/default-embed-setting";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

export const SelectEmbedTypeStep = () => {
  const {
    embedType,
    settings,
    setSettings,
    recentDashboards,
    recentQuestions,
  } = useSdkIframeEmbedSetupContext();

  const handleEmbedTypeChange = (type: SdkIframeEmbedSetupType) => {
    const persistedSettings = _.pick(settings, [
      "theme",
      "instanceUrl",
      "apiKey",
    ]);

    const defaultEntityId = match(type)
      .with("dashboard", () => recentDashboards[0]?.id ?? 1)
      .with("chart", () => recentQuestions[0]?.id ?? 1)
      .otherwise(() => 1);

    setSettings({
      // clear other entity types
      template: undefined,
      questionId: undefined,
      dashboardId: undefined,

      // these settings do not change when the embed type changes
      ...persistedSettings,

      // these settings are overridden when the embed type changes
      ...getDefaultSdkIframeEmbedSettings(type, defaultEntityId),
    });
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
