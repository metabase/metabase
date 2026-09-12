import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";

export function WorkspacesSettingsSection() {
  return (
    <SettingsSection title={t`Workspaces`}>
      <AdminSettingInput
        name="workspaces-enabled"
        title={t`Enable workspaces`}
        description={t`Transforms write their output tables into the workspace schema of each database instead of their configured target schema, transparently to everything that reads them.`}
        inputType="boolean"
      />
    </SettingsSection>
  );
}
