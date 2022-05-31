import React, { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import BrandColorSettings from "../BrandColorSettings";
import ChartColorSettings from "../ChartColorSettings";
import ChartColorPreview from "../ChartColorPreview";
import {
  BrandColorSection,
  ChartColorSection,
  SectionContent,
  SettingRoot,
  SettingTitle,
} from "./ColorSettings.styled";

export interface ColorSettingsProps {
  initialColors: Record<string, string> | null;
  originalColors: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const ColorSettings = ({
  initialColors,
  originalColors,
  onChange,
}: ColorSettingsProps): JSX.Element => {
  const [colors, setColors] = useState(initialColors ?? {});

  const colorFamily = useMemo(() => {
    return { ...originalColors, ...colors };
  }, [colors, originalColors]);

  const handleChange = useCallback(
    (colors: Record<string, string>) => {
      setColors(colors);
      onChange?.(colors);
    },
    [onChange],
  );

  return (
    <SettingRoot>
      <BrandColorSection>
        <SettingTitle>{t`User interface colors`}</SettingTitle>
        <BrandColorSettings
          colors={colors}
          colorFamily={colorFamily}
          onChange={handleChange}
        />
      </BrandColorSection>
      <ChartColorSection>
        <SettingTitle>{t`Chart colors`}</SettingTitle>
        <SectionContent>
          <ChartColorSettings
            colors={colors}
            colorFamily={colorFamily}
            onChange={handleChange}
          />
          <ChartColorPreview />
        </SectionContent>
      </ChartColorSection>
    </SettingRoot>
  );
};

export default ColorSettings;
