import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellPerformanceTools } from "metabase/admin/upsells";

export const ToolsUpsell = () => {
  return (
    <SettingsPageWrapper title={t`Erroring questions`}>
      <UpsellPerformanceTools source="settings-tools" />
    </SettingsPageWrapper>
  );
};
