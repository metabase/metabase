import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Select } from "metabase/ui";

import type { FontSetting, FontSettingKeys, FontSettingValues } from "./types";

export interface FontWidgetProps {
  setting: FontSetting;
  settingValues: FontSettingValues;
  onChange: (value: string) => void;
  onChangeSetting: (key: FontSettingKeys, value: unknown) => void;
}

const CUSTOM = "custom";

const FontWidget = ({
  setting,
  settingValues,
  onChange,
  onChangeSetting,
}: FontWidgetProps): JSX.Element => {
  const availableFonts = useSetting("available-fonts");
  const value = !settingValues["application-font-files"]
    ? setting.value ?? setting.default
    : CUSTOM;

  const options = useMemo(
    () => [
      ...availableFonts.map(font => ({ label: font, value: font })),
      { label: t`Custom…`, value: CUSTOM },
    ],
    [availableFonts],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (value !== CUSTOM) {
        onChange(value);
        onChangeSetting("application-font-files", null);
      } else {
        onChange(setting.default);
        onChangeSetting("application-font-files", []);
      }
    },
    [setting, onChange, onChangeSetting],
  );

  return <Select value={value} data={options} onChange={handleChange} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FontWidget;
