import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import BrandColorSettings from "../BrandColorSettings";
import ChartColorPreview from "../ChartColorPreview";
import ChartColorSettings from "../ChartColorSettings";

import {
  BrandColorSection,
  ChartColorSection,
  SectionContent,
  SettingDescription,
  SettingRoot,
  SettingTitle,
} from "./ColorSettings.styled";

export interface ColorSettingsProps {
  initialColors: ColorSettingsType | null;
  originalColors: ColorSettingsType;
  onChange?: (colors: ColorSettingsType) => void;
}

export const ColorSettings = ({
  initialColors,
  originalColors,
  onChange,
}: ColorSettingsProps): JSX.Element => {
  const [colors, setColors] = useState(initialColors ?? {});

  const colorPalette = useMemo(() => {
    return { ...originalColors, ...colors };
  }, [colors, originalColors]);

  const handleChange = useCallback(
    (colors: ColorSettingsType) => {
      setColors(colors);
      onChange?.(colors);
    },
    [onChange],
  );

  return (
    <SettingRoot>
      <BrandColorSection>
        <SettingTitle hasDescription>{t`User interface colors`}</SettingTitle>
        <SettingDescription>
          {t`Note: deleting each of the values will revert them back to default.`}
        </SettingDescription>
        <BrandColorSettings
          colors={colors}
          colorPalette={colorPalette}
          onChange={handleChange}
        />
      </BrandColorSection>
      <ChartColorSection>
        <SettingTitle hasDescription>{t`Chart colors`}</SettingTitle>
        <SettingDescription>
          {t`Choose up to 24 hex values. We’ll auto-generate what you leave blank.`}
        </SettingDescription>
        <SectionContent>
          <ChartColorSettings
            colors={colors}
            colorPalette={colorPalette}
            onChange={handleChange}
          />
          <ChartColorPreview colorPalette={colorPalette} />
        </SectionContent>
      </ChartColorSection>
    </SettingRoot>
  );
};
