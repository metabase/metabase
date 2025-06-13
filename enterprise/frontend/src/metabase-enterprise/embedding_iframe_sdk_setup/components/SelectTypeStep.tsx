import { t } from "ttag";

import { Card, Radio, Stack, Text } from "metabase/ui";

import { EMBED_TYPES } from "../constants";
import type { EmbedType } from "../types";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

export const SelectTypeStep = () => {
  const { options, updateOptions } = useSdkIframeEmbedSetupContext();

  const handleTypeChange = (type: EmbedType) => {
    // Update the type and reset settings based on the selected type
    const baseSettings = {
      isDrillThroughEnabled: false,
      withDownloads: false,
      withTitle: true,
    };

    let newSettings;
    switch (type) {
      case "dashboard":
        newSettings = {
          ...baseSettings,
          dashboardId: 1,
          initialParameters: {},
          hiddenParameters: [],
          // Clear question/exploration specific properties
          questionId: undefined,
          template: undefined,
        };
        break;
      case "chart":
        newSettings = {
          ...baseSettings,
          questionId: 1,
          initialSqlParameters: {},
          // Clear dashboard/exploration specific properties
          dashboardId: undefined,
          template: undefined,
        };
        break;
      case "exploration":
        newSettings = {
          template: "exploration" as const,
          // Clear dashboard/question specific properties
          dashboardId: undefined,
          questionId: undefined,
        };
        break;
    }

    updateOptions({
      selectedType: type,
      settings: newSettings,
    });
  };

  return (
    <Card p="md" mb="md">
      <Text size="lg" fw="bold" mb="md">
        {t`Select your embed experience`}
      </Text>
      <Radio.Group
        value={options.selectedType}
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
