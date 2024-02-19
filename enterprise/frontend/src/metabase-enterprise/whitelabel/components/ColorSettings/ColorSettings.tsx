import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
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
import { RefreshConfirmationModal } from "./RefreshConfirmationModal";

export interface ColorSettingsProps {
  colorsSettingValue: Record<string, string> | null;
  originalColors: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

export const ColorSettings = ({
  colorsSettingValue,
  originalColors,
  onChange,
}: ColorSettingsProps): JSX.Element => {
  const [initialColors] = useState(colorsSettingValue ?? {});
  const [colors, setColors] = useState(colorsSettingValue ?? {});
  const isDirty = !_.isEqual(initialColors, colors);

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
      <RefreshConfirmationModal isEnabled={isDirty} />
    </SettingRoot>
  );
};
