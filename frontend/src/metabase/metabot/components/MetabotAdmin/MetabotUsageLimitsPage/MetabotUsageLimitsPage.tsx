import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { MetabotNavPane } from "metabase/metabot/components/MetabotAdmin/MetabotNavPane";

import { GeneralLimitsSettingsSection } from "./GeneralLimitsSettingsSection";
import { GroupLimitsSettingsSection } from "./GroupLimitsSettingsSection";

export function MetabotUsageLimitsPage() {
  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <SettingsPageWrapper title={t`AI usage limits`} mt="sm">
        <GeneralLimitsSettingsSection />
        <GroupLimitsSettingsSection />
      </SettingsPageWrapper>
    </AdminSettingsLayout>
  );
}
