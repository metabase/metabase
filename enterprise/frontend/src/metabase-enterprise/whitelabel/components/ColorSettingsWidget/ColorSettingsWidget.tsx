import { useDebouncedCallback } from "@mantine/hooks";

import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { originalColors } from "metabase/lib/colors/palette";
import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import { ColorSettings } from "../ColorSettings";

export const ColorSettingsWidget = () => {
  const {
    value: colorSettings,
    updateSetting,
    settingDetails,
  } = useAdminSetting("application-colors");

  const handleChange = (newValue: ColorSettingsType) => {
    updateSetting({
      key: "application-colors",
      value: newValue,
    });
  };

  const onChangeDebounced = useDebouncedCallback(handleChange, 400);

  if (!colorSettings) {
    return null;
  }

  if (settingDetails?.is_env_setting && settingDetails?.env_name) {
    return <SetByEnvVar varName={settingDetails.env_name} />;
  }

  return (
    <ColorSettings
      initialColors={colorSettings}
      originalColors={originalColors}
      onChange={onChangeDebounced}
    />
  );
};
