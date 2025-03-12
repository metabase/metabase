import { t } from "ttag";

import { useAdminSetting } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Stack, Switch } from "metabase/ui";

import { trackTrackingPermissionChanged } from "../../analytics";
import { SettingHeader } from "../SettingHeader";

export function AnonymousTrackingInput() {
  const { value, updateSetting } = useAdminSetting("anon-tracking-enabled");
  const [sendToast] = useToast();

  const handleChange = async (newValue: boolean) => {
    if (value) {
      trackTrackingPermissionChanged(newValue);
    }
    await updateSetting({
      key: "anon-tracking-enabled",
      value: newValue,
    });
    if (newValue) {
      trackTrackingPermissionChanged(newValue);
    }
    sendToast({ message: t`Changes saved`, icon: "check" });
  };

  return (
    <Stack>
      <SettingHeader
        id="anon-tracking-enabled"
        title={t`Anonymous Tracking`}
        description={t`Enable the collection of anonymous usage data in order to help Metabase improve.`}
      />
      <Switch
        id="anon-tracking-enabled"
        checked={value}
        onChange={e => handleChange(e.target.checked)}
        label={value ? t`Enabled` : t`Disabled`}
      />
    </Stack>
  );
}
