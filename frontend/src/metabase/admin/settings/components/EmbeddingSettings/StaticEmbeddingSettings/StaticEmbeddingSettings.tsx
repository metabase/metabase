import { t } from "ttag";

import {
  RelatedSettingsSection,
  getStaticEmbeddingRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { SharedCombinedEmbeddingSettings } from "metabase/admin/settings/components/EmbeddingSettings/SharedCombinedEmbeddingSettings";

export function StaticEmbeddingSettings() {
  return (
    <SettingsPageWrapper title={t`Static embedding`}>
      <SharedCombinedEmbeddingSettings />

      <RelatedSettingsSection items={getStaticEmbeddingRelatedSettingItems()} />
    </SettingsPageWrapper>
  );
}
