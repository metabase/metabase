import { t } from "ttag";

import {
  RelatedSettingsSection,
  getGuestEmbedsRelatedSettingItems,
} from "metabase/admin/components/RelatedSettingsSection";
import { SharedCombinedEmbeddingSettings } from "metabase/admin/settings/components/EmbeddingSettings/SharedCombinedEmbeddingSettings";
import { SettingsPageWrapper } from "metabase/settings-components";

export function GuestEmbedsSettings() {
  return (
    <SettingsPageWrapper title={t`Guest embeds`}>
      <SharedCombinedEmbeddingSettings />

      <RelatedSettingsSection items={getGuestEmbedsRelatedSettingItems()} />
    </SettingsPageWrapper>
  );
}
