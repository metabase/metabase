import { ChangeEvent, useCallback, useMemo } from "react";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { FontSetting, FontSettingKeys, FontSettingValues } from "./types";
import { FontSelect } from "./FontWidget.styled";

export interface FontWidgetProps {
  setting: FontSetting;
  settingValues: FontSettingValues;
  availableFonts?: string[];
  onChange: (value: string) => void;
  onChangeSetting: (key: FontSettingKeys, value: unknown) => void;
}

const FontWidget = ({
  setting,
  settingValues,
  availableFonts = MetabaseSettings.get("available-fonts") || [],
  onChange,
  onChangeSetting,
}: FontWidgetProps): JSX.Element => {
  const value = !settingValues["application-font-files"]
    ? setting.value ?? setting.default
    : null;

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
        onChange(setting.default);
        onChangeSetting("application-font-files", []);
      }
    },
    [setting, onChange, onChangeSetting],
  );

  return <FontSelect value={value} options={options} onChange={handleChange} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FontWidget;
