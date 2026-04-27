import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";

import { AdminSettingInput } from "../widgets/AdminSettingInput";

export function DataStudioSettingsPage() {
  return (
    <SettingsPageWrapper title={t`Data Studio`}>
      <SettingsSection>
        <AdminSettingInput
          name="transforms-disabled"
          title={t`Disable transforms`}
          description={t`When enabled, prevents all transforms from running. Existing scheduled jobs and manual runs will be blocked until this is turned off.`}
          inputType="boolean"
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
