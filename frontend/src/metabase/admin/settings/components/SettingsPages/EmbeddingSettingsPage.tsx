import { t } from "ttag";

import { Stack } from "metabase/ui";

import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../EmbeddingSettings/EmbeddingOption";
import { SettingHeader } from "../SettingHeader";

export function EmbeddingSettingsPage() {
  return (
    <Stack gap="2.5rem">
      <SettingHeader
        id="enable-embedding"
        title={t`Embedding`}
        description={t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
      />
      <StaticEmbeddingOptionCard />
      <InteractiveEmbeddingOptionCard />
      <EmbeddingSdkOptionCard />
    </Stack>
  );
}
