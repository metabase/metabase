import { useDebouncedCallback } from "use-debounce";

import { useAdminSetting } from "metabase/api/utils";
import { originalColors } from "metabase/lib/colors/palette";
import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import { ColorSettings } from "../ColorSettings";

export const ColorSettingsWidget = () => {
  const { value: colorSettings, updateSetting } =
    useAdminSetting("application-colors");

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

  return (
    <ColorSettings
      initialColors={colorSettings}
      originalColors={originalColors}
      onChange={onChangeDebounced}
    />
  );
};
