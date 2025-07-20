import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { Box, Stack } from "metabase/ui";
import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import BrandColorSettings from "../BrandColorSettings";
import ChartColorPreview from "../ChartColorPreview";
import ChartColorSettings from "../ChartColorSettings";

import { SectionContent } from "./ColorSettings.styled";

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
    <Stack gap="lg">
      <Box>
        <SettingHeader
          id="user-interface-colors"
          title={t`User interface colors`}
          description={t`Note: deleting each of the values will revert them back to default.`}
        />
        <BrandColorSettings
          colors={colors}
          colorPalette={colorPalette}
          onChange={handleChange}
        />
      </Box>
      <Box>
        <SettingHeader
          id="chart-colors"
          title={t`Chart colors`}
          description={t`Choose up to 24 hex values. We’ll auto-generate what you leave blank.`}
        />
        <SectionContent>
          <ChartColorSettings
            colors={colors}
            colorPalette={colorPalette}
            onChange={handleChange}
          />
          <ChartColorPreview colorPalette={colorPalette} />
        </SectionContent>
      </Box>
    </Stack>
  );
};
