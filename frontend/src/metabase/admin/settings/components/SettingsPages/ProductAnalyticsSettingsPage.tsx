import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";

import { AdminSettingInput } from "../widgets/AdminSettingInput";

export function ProductAnalyticsSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Product Analytics`}>
      <SettingsSection>
        <AdminSettingInput
          name="product-analytics"
          title={t`Enabled`}
          inputType="boolean"
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
