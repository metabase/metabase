import { t } from "ttag";

import {
  RelatedSettingsSection,
  getGuestEmbedsRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { SharedCombinedEmbeddingSettings } from "metabase/admin/settings/components/EmbeddingSettings/SharedCombinedEmbeddingSettings";

export function GuestEmbedsSettings() {
  return (
    <SettingsPageWrapper title={t`Guest embeds`}>
      <SharedCombinedEmbeddingSettings />

      <RelatedSettingsSection items={getGuestEmbedsRelatedSettingItems()} />
    </SettingsPageWrapper>
  );
}
