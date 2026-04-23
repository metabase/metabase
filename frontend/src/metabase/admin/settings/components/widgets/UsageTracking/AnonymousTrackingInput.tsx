import { t } from "ttag";

import { trackTrackingPermissionChanged } from "../../../analytics";

import { BaseUsageTrackingSettingToggle } from "./BaseUsageTrackingSettingToggle";

export function AnonymousTrackingInput() {
  return (
    <BaseUsageTrackingSettingToggle
      settingName="anon-tracking-enabled"
      title={t`Anonymous tracking`}
      trackChange={trackTrackingPermissionChanged}
    />
  );
}
