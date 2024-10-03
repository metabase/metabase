import type { ChangeEvent } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Stack, Text } from "metabase/ui";

import SettingHeader from "../SettingHeader";
import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../widgets/EmbeddingOption";

import type { AdminSettingComponentProps } from "./types";

export function EmbeddingSettings({
  updateSetting,
}: AdminSettingComponentProps) {
  function handleToggleStaticEmbedding(event: ChangeEvent<HTMLInputElement>) {
    updateSetting({ key: "enable-embedding-static" }, event.target.checked);
    // TODO: remove before merging integration branch
    updateSetting({ key: "enable-embedding" }, event.target.checked);
  }

  function handleToggleEmbeddingSdk(event: ChangeEvent<HTMLInputElement>) {
    updateSetting({ key: "enable-embedding-sdk" }, event.target.checked);
  }

  function handleToggleInteractiveEmbedding(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    updateSetting(
      { key: "enable-embedding-interactive" },
      event.target.checked,
    );
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
          <Stack spacing={"md"} className={CS.textMeasure}>
            <Text lh={1.5}>
              {t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
            </Text>
          </Stack>
        </Box>
        <StaticEmbeddingOptionCard onToggle={handleToggleStaticEmbedding} />
        <EmbeddingSdkOptionCard onToggle={handleToggleEmbeddingSdk} />
        <InteractiveEmbeddingOptionCard
          onToggle={handleToggleInteractiveEmbedding}
        />
      </Stack>
    </Box>
  );
}
