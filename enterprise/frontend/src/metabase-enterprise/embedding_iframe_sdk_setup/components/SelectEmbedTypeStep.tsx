import { match } from "ts-pattern";
import { t } from "ttag";

import { Card, Radio, Stack, Text } from "metabase/ui";
import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

import { EMBED_TYPES } from "../constants";
import type { EmbedType } from "../types";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

export const SelectEmbedTypeStep = () => {
  const { selectedType, settings, updateOptions } =
    useSdkIframeEmbedSetupContext();

  const handleTypeChange = (type: EmbedType) => {
    const nextSettings: Partial<SdkIframeEmbedSettings> = match(type)
      .with("dashboard", () => ({
        dashboardId: 1,

        // Clear question/exploration specific properties
        questionId: undefined,
        template: undefined,
      }))
      .with("chart", () => ({
        questionId: 1,

        // Clear dashboard/exploration specific properties
        dashboardId: undefined,
        template: undefined,
      }))
      .with("exploration", () => ({
        template: "exploration" as const,

        // Clear dashboard/question specific properties
        dashboardId: undefined,
        questionId: undefined,
      }))
      .exhaustive();

    updateOptions({
      selectedType: type,
      settings: {
        isDrillThroughEnabled: false,
        withDownloads: false,
        withTitle: true,
        ...settings,
        ...nextSettings,
      } as SdkIframeEmbedSettings,
    });
  };

  return (
    <Card p="md" mb="md">
      <Text size="lg" fw="bold" mb="md">
        {t`Select your embed experience`}
      </Text>

      <Radio.Group
        value={selectedType}
        onChange={(value) => handleTypeChange(value as EmbedType)}
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
