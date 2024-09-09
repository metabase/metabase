import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";

import { getSettings } from "../../selectors";
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
  const enableEmbeddingSetting = useSelector(getSettings).find(
    (setting: any) => setting.key === "enable-embedding",
  );

  function handleChangeEnableEmbedding(value: boolean) {
    updateSetting({ key: "enable-embedding" }, value);
  }

  function handleToggleEmbeddingSdk(event: ChangeEvent<HTMLInputElement>) {
    updateSetting({ key: "enable-embedding-sdk" }, event.target.checked);
  }

  return (
    <Box p="0.5rem 1rem 0">
      <Stack spacing="2.5rem">
        <Box data-testid="enable-embedding-setting">
          <SettingHeader
            id="enable-embedding"
            setting={{
              display_name: t`Embedding`,
            }}
          />
          <SetByEnvVarWrapper setting={enableEmbeddingSetting}>
            <EmbeddingSwitchWidget
              setting={enableEmbeddingSetting}
              onChange={handleChangeEnableEmbedding}
            />
          </SetByEnvVarWrapper>
        </Box>
        <StaticEmbeddingOptionCard />
        <EmbeddingSdkOptionCard onToggle={handleToggleEmbeddingSdk} />
        <InteractiveEmbeddingOptionCard />
      </Stack>
    </Box>
  );
}
