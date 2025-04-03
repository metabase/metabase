import { t } from "ttag";

import { useAdminSetting } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { Stack } from "metabase/ui";

import { trackTrackingPermissionChanged } from "../../analytics";
import { SettingHeader } from "../SettingHeader";

import { BasicAdminSettingInput } from "./AdminSettingInput";

export function AnonymousTrackingInput() {
  const { value, updateSetting, description } = useAdminSetting(
    "anon-tracking-enabled",
  );
  const [sendToast] = useToast();

  const handleChange = async (newValue: boolean) => {
    if (value) {
      trackTrackingPermissionChanged(newValue);
    }
    await updateSetting({
      key: "anon-tracking-enabled",
      value: newValue,
    }).then((response) => {
      if (response?.error) {
        const message =
          (response.error as GenericErrorResponse)?.message ||
          t`Error updating setting`;
        sendToast({ message, icon: "warning", toastColor: "danger" });
      } else {
        sendToast({ message: t`Changes saved`, icon: "check" });
        if (newValue) {
          trackTrackingPermissionChanged(newValue);
        }
      }
    });
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
