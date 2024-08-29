import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";

import { getSettingsByKey } from "../../selectors";
import { updateSetting } from "../../settings";
import SettingHeader from "../SettingHeader";
import { SetByEnvVarWrapper } from "../SettingsSetting";
import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../widgets/EmbeddingOption";
import { EmbeddingSwitchWidget } from "../widgets/EmbeddingSwitchWidget";

export function EmbeddingSettings() {
  const enableEmbeddingSetting =
    useSelector(getSettingsByKey)["enable-embedding"];

  const dispatch = useDispatch();

  function onChangeEnableEmbedding(value: boolean) {
    dispatch(
      updateSetting({
        key: "enable-embedding",
        value,
      }),
    );
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
        <EmbeddingSdkOptionCard />
        <InteractiveEmbeddingOptionCard />
      </Stack>
    </Box>
  );
}
