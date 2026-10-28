import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/settings-components";

import { GeneralLimitsSettingsSection } from "./GeneralLimitsSettingsSection";
import { GroupLimitsSettingsSection } from "./GroupLimitsSettingsSection";

export function MetabotUsageLimitsPage() {
  return (
    <SettingsPageWrapper title={t`AI usage limits`} mt="sm">
      <GeneralLimitsSettingsSection />
      <GroupLimitsSettingsSection />
    </SettingsPageWrapper>
  );
}
