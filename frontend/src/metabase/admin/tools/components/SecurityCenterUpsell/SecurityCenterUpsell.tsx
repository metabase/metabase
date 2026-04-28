import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellSecurityCenter } from "metabase/admin/upsells";

export const SecurityCenterUpsell = () => {
  return (
    <SettingsPageWrapper title={t`Security Center`}>
      <UpsellSecurityCenter source="settings-tools-security-center" />
    </SettingsPageWrapper>
  );
};
