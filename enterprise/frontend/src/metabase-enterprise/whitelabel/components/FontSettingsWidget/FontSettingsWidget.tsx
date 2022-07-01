import React, { useCallback } from "react";
import MetabaseSettings from "metabase/lib/settings";
import FontSettings from "../FontSettings";
import { FontSetting, FontValues } from "./types";
import { FontFile } from "metabase-types/api";

export interface FontSettingsWidgetProps {
  setting: FontSetting;
  values: FontValues;
  onChange: (value: string | null) => void;
  onChangeField: (name: keyof FontValues, value: unknown) => void;
}

const FontSettingsWidget = ({
  setting,
  values,
  onChange,
  onChangeField,
}: FontSettingsWidgetProps): JSX.Element => {
  const handleFontFiles = useCallback(
    (fontFiles: FontFile[]) => {
      onChangeField("application-font-files", fontFiles);
    },
    [onChangeField],
  );

  return (
    <FontSettings
      font={setting.value}
      availableFonts={MetabaseSettings.get("available-fonts")}
      fontFiles={values["application-font-files"]}
      onChangeFont={onChange}
      onChangeFontFiles={handleFontFiles}
    />
  );
};

export default FontSettingsWidget;
