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
          name="transforms-enabled"
          title={t`Enable transforms`}
          description={t`When turned off, no transforms will run. Existing scheduled jobs and manual runs are blocked until this is turned back on.`}
          inputType="boolean"
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
