import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import BrandColorSettings from "../BrandColorSettings";
import ChartColorSettings from "../ChartColorSettings";
import ChartColorPreview from "../ChartColorPreview";
import {
  BrandColorSection,
  ChartColorSection,
  SectionContent,
  SettingDescription,
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

  const colorPalette = useMemo(() => {
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
          colorPalette={colorPalette}
          onChange={handleChange}
        />
      </BrandColorSection>
      <ChartColorSection>
        <SettingTitle hasDescription>{t`Chart colors`}</SettingTitle>
        <SettingDescription>
          {t`You can choose up to 24 hex values. We’ll auto-generate what you leave blank.`}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorSettings;
