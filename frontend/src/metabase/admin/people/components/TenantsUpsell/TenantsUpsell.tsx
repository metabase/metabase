import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellTenants } from "metabase/admin/upsells";

export const TenantsUpsell = () => {
  return (
    <SettingsPageWrapper title={t`Tenants`}>
      <UpsellTenants source="settings-people-tenants" />
    </SettingsPageWrapper>
  );
};
