import React, { useCallback } from "react";
import MetabaseSettings from "metabase/lib/settings";
import { FontFile } from "metabase-types/api";
import FontSettings from "../FontSettings";
import { FontSettingKey, FontSettingValues } from "./types";

export interface FontSettingsWidgetProps {
  settingValues: FontSettingValues;
  onChangeSetting: (name: FontSettingKey, value: unknown) => void;
}

const FontSettingsWidget = ({
  settingValues,
  onChangeSetting,
}: FontSettingsWidgetProps): JSX.Element => {
  const handleFontChange = useCallback(
    (font: string | null) => {
      onChangeSetting("application-font", font);
    },
    [onChangeSetting],
  );

  const handleFontFilesChange = useCallback(
    (fontFiles: FontFile[]) => {
      onChangeSetting("application-font-files", fontFiles);
    },
    [onChangeSetting],
  );

  return (
    <FontSettings
      font={settingValues["application-font"]}
      fontFiles={settingValues["application-font-files"] ?? []}
      availableFonts={MetabaseSettings.get("available-fonts")}
      onChangeFont={handleFontChange}
      onChangeFontFiles={handleFontFilesChange}
    />
  );
};

export default FontSettingsWidget;
