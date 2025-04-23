import { t } from "ttag";
import _ from "underscore";

import { useAdminSetting } from "metabase/api/utils";
import { Stack } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

import { BasicAdminSettingInput, SetByEnvVar } from "./AdminSettingInput";

// The backend accepts a string array for multiple reply-to emails,
// but currently the frontend only lets the user enter a single email.
//
// Issue with historical context: https://github.com/metabase/metabase/issues/22540
export function EmailReplyToWidget() {
  const {
    value: initialValue,
    updateSetting,
    description,
    isLoading,
    settingDetails,
  } = useAdminSetting("email-reply-to");

  if (isLoading) {
    return null;
  }

  const handleChange = (newValue: any) => {
    if (_.isEqual([newValue], initialValue)) {
      return;
    }
    updateSetting({
      key: "email-reply-to",
      value: newValue ? [newValue] : null,
    });
  };

  return (
    <Stack data-testid="email-reply-to-setting">
      <SettingHeader
        id="email-reply-to"
        title={t`Reply-To Address`}
        description={description}
      />
      {settingDetails?.is_env_setting && settingDetails?.env_name ? (
        <SetByEnvVar varName={settingDetails.env_name} />
      ) : (
        <BasicAdminSettingInput
          name="email-reply-to"
          inputType="text"
          value={initialValue ? initialValue[0] : ""}
          onChange={handleChange}
        />
      )}
    </Stack>
  );
}
