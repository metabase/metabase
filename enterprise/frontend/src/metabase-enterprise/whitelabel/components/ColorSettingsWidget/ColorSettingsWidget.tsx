import { useDebouncedCallback } from "@mantine/hooks";

import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { useMantineTheme } from "metabase/ui";
import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import { ColorSettings } from "../ColorSettings";

export const ColorSettingsWidget = () => {
  const {
    value: colorSettings,
    updateSetting,
    settingDetails,
  } = useAdminSetting("application-colors");
  const theme = useMantineTheme();

  const themeColors = Object.fromEntries(
    Object.entries(theme.colors).map(([colorName, color]) => [
      colorName,
      color[theme.primaryShade as number],
    ]),
  );

  const handleChange = async (newValue: ColorSettingsType) => {
    await updateSetting({
      key: "application-colors",
      value: newValue,
    });
    theme.other?.updateColorSettings?.(newValue);
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
      themeColors={themeColors}
      onChange={onChangeDebounced}
    />
  );
};
