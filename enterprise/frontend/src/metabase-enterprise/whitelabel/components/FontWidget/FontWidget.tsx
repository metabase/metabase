import React, { ChangeEvent, useCallback, useMemo } from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { FontFile } from "metabase-types/api";
import { FontSetting, FontFilesKey } from "./types";
import { FontSelect } from "./FontWidget.styled";

export interface FontWidgetProps {
  setting: FontSetting;
  availableFonts?: string[];
  onChange: (value: string) => void;
  onChangeSetting: (key: FontFilesKey, value: FontFile[] | null) => void;
}

const FontWidget = ({
  setting,
  availableFonts = MetabaseSettings.get("available-fonts"),
  onChange,
  onChangeSetting,
}: FontWidgetProps): JSX.Element => {
  const value = setting.value ?? setting.defaultValue;

  const options = useMemo(
    () => [
      ...availableFonts.map(font => ({ name: font, value: font })),
      { name: t`Custom…`, value: null },
    ],
    [availableFonts],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      if (event.target.value) {
        onChange(event.target.value);
        onChangeSetting("application-font-files", null);
      } else {
        onChange(setting.defaultValue);
        onChangeSetting("application-font-files", []);
      }
    },
    [setting, onChange, onChangeSetting],
  );

  return <FontSelect value={value} options={options} onChange={handleChange} />;
};

export default FontWidget;
