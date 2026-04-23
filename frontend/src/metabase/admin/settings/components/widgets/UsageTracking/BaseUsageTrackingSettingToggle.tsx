import { useAdminSetting } from "metabase/api/utils";
import { Stack } from "metabase/ui";
import type { Settings } from "metabase-types/api";

import { SettingHeader } from "../../SettingHeader";
import {
  BasicAdminSettingInput,
  SetByEnvVarWrapper,
} from "../AdminSettingInput";

interface BaseUsageTrackingSettingToggleProps {
  settingName: keyof Settings;
  title: string;
  trackChange: (isEnabled: boolean) => void;
}

export function BaseUsageTrackingSettingToggle({
  settingName,
  title,
  trackChange,
}: BaseUsageTrackingSettingToggleProps) {
  const { value, updateSetting, description, settingDetails } =
    useAdminSetting(settingName);

  const handleChange = async (newValue: boolean) => {
    if (value) {
      // if we're changing this getting turned off, we need to track it before it's changed
      trackChange(newValue);
    }

    await updateSetting({
      key: settingName,
      value: newValue,
    });

    if (newValue) {
      trackChange(newValue);
    }
  };

  return (
    <Stack>
      <SettingHeader id={settingName} title={title} description={description} />
      <SetByEnvVarWrapper
        settingKey={settingName}
        settingDetails={settingDetails}
      >
        <BasicAdminSettingInput
          name={settingName}
          inputType="boolean"
          value={value}
          onChange={(newValue) => handleChange(Boolean(newValue))}
        />
      </SetByEnvVarWrapper>
    </Stack>
  );
}
