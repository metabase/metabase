import { t } from "ttag";

import { Stack } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";
import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../widgets/EmbeddingOption";

export function EmbeddingSettings() {
  return (
    <Stack gap="2.5rem" p="0.5rem 1rem 0">
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
