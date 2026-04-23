import { t } from "ttag";

import { trackAnalyticsPiiRetentionChanged } from "../../../analytics";

import { BaseUsageTrackingSettingToggle } from "./BaseUsageTrackingSettingToggle";

export function CollectUserDataInput() {
  return (
    <BaseUsageTrackingSettingToggle
      settingName="analytics-pii-retention-enabled"
      title={t`Collect user data`}
      trackChange={trackAnalyticsPiiRetentionChanged}
    />
  );
}
