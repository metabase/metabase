import React, { useCallback, useState } from "react";
import { t } from "ttag";
import BrandColorSettings from "../BrandColorSettings";
import {
  SettingRoot,
  SettingSection,
  SettingTitle,
} from "./ColorSettings.styled";

export interface ColorSettingsProps {
  initialColors?: Record<string, string>;
  originalColors?: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const ColorSettings = ({
  initialColors = {},
  originalColors = {},
  onChange,
}: ColorSettingsProps): JSX.Element => {
  const [colors, setColors] = useState(initialColors);

  const handleChange = useCallback(
    (colors: Record<string, string>) => {
      setColors(colors);
      onChange?.(colors);
    },
    [onChange],
  );

  return (
    <SettingRoot>
      <SettingSection>
        <SettingTitle>{t`User interface colors`}</SettingTitle>
        <BrandColorSettings
          colors={colors}
          originalColors={originalColors}
          onChange={handleChange}
        />
      </SettingSection>
      <SettingSection>
        <SettingTitle>{t`Chart colors`}</SettingTitle>
      </SettingSection>
    </SettingRoot>
  );
};

export default ColorSettings;
