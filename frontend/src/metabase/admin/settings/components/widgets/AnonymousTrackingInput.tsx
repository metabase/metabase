import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Stack } from "metabase/ui";

import { trackTrackingPermissionChanged } from "../../analytics";
import { SettingHeader } from "../SettingHeader";

import { BasicAdminSettingInput } from "./AdminSettingInput";

export function AnonymousTrackingInput() {
  const { value, updateSetting, description } = useAdminSetting(
    "anon-tracking-enabled",
  );

  const handleChange = async (newValue: boolean) => {
    if (value) {
      // if we're changing this getting turned off, we need to track it before it's changed
      trackTrackingPermissionChanged(newValue);
    }
    await updateSetting({
      key: "anon-tracking-enabled",
      value: newValue,
    });
    if (newValue) {
      trackTrackingPermissionChanged(newValue);
    }
  };

  return (
    <Stack>
      <SettingHeader
        id="anon-tracking-enabled"
        title={t`Anonymous Tracking`}
        description={description}
      />
      <BasicAdminSettingInput
        name="anon-tracking-enabled"
        inputType="boolean"
        value={value}
        onChange={(newValue) => handleChange(Boolean(newValue))}
      />
    </Stack>
  );
}
