import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellDevInstances } from "metabase/admin/upsells";

import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../EmbeddingSettings/EmbeddingOption";

export function EmbeddingSettingsPage() {
  return (
    <SettingsPageWrapper
      title={t`Embedding`}
      description={t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
    >
      <StaticEmbeddingOptionCard />
      <InteractiveEmbeddingOptionCard />
      <EmbeddingSdkOptionCard />
      <UpsellDevInstances location="embedding-page" />
    </SettingsPageWrapper>
  );
}
