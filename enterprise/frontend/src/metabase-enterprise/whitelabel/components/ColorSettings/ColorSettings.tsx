import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { Box, Stack, Tabs } from "metabase/ui";
import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import BrandColorSettings from "../BrandColorSettings";
import ChartColorPreview from "../ChartColorPreview";
import ChartColorSettings from "../ChartColorSettings";

export interface ColorSettingsProps {
  initialColors: ColorSettingsType | null;
  themeColors: ColorSettingsType;
  onChange?: (colors: ColorSettingsType) => void;
}

export const ColorSettings = ({
  initialColors,
  themeColors,
  onChange,
}: ColorSettingsProps): JSX.Element => {
  const [colors, setColors] = useState(initialColors ?? {});

  const colorPalette = useMemo(() => {
    return { ...themeColors, ...colors };
  }, [colors, themeColors]);

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
          description={t`Choose up to 24 hex values. We'll auto-generate what you leave blank.`}
        />
        <Box>
          <Tabs defaultValue="chart-colors">
            <Tabs.List>
              <Tabs.Tab value="chart-colors">{t`Colors`}</Tabs.Tab>
              <Tabs.Tab value="palette-preview">{t`Preview`}</Tabs.Tab>
            </Tabs.List>

            <Box mt="lg" bdrs={0}>
              <Tabs.Panel value="chart-colors">
                <ChartColorSettings
                  colors={colors}
                  colorPalette={colorPalette}
                  onChange={handleChange}
                />
              </Tabs.Panel>

              <Tabs.Panel value="palette-preview">
                <ChartColorPreview colorPalette={colorPalette} />
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Box>
      </Box>
    </Stack>
  );
};
