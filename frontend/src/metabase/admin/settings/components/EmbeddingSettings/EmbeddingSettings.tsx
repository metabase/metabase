import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";

import { getSettingsByKey } from "../../selectors";
import SettingHeader from "../SettingHeader";
import { SetByEnvVarWrapper } from "../SettingsSetting";
import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../widgets/EmbeddingOption";
import { EmbeddingSwitchWidget } from "../widgets/EmbeddingSwitchWidget";

import type { AdminSettingComponentProps } from "./types";

export function EmbeddingSettings({
  updateSetting,
}: AdminSettingComponentProps) {
  const enableEmbeddingSetting =
    useSelector(getSettingsByKey)["enable-embedding"];

  function onChangeEnableEmbedding(value: boolean) {
    updateSetting("enable-embedding", value);
  }

  return (
    <Box p="0.5rem 1rem 0">
      <SettingHeader
        id="enable-embedding"
        setting={{
          display_name: t`Embedding`,
        }}
      />
      <Stack spacing="2.5rem">
        <SetByEnvVarWrapper setting={enableEmbeddingSetting}>
          <EmbeddingSwitchWidget
            setting={enableEmbeddingSetting}
            onChange={onChangeEnableEmbedding}
          />
        </SetByEnvVarWrapper>
        <StaticEmbeddingOptionCard />
        <InteractiveEmbeddingOptionCard />
        <EmbeddingSdkOptionCard />
      </Stack>
    </Box>
  );
}
