import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellSerialization } from "metabase/admin/upsells";

export const SerializationUpsell = () => {
  return (
    <SettingsPageWrapper title={t`Serialization`}>
      <UpsellSerialization source="settings-tools-serialization" />
    </SettingsPageWrapper>
  );
};
