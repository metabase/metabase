import { useState } from "react";
import { t } from "ttag";

import { Box, Tabs } from "metabase/ui";
import type { ColorSettings as ColorSettingsType } from "metabase-types/api";

import ChartColorPreview from "../ChartColorPreview";
import ChartColorSettings from "../ChartColorSettings";

export interface ChartColorTabsProps {
  colors: ColorSettingsType;
  colorPalette: ColorSettingsType;
  onChange: (colors: ColorSettingsType) => void;
}

const ChartColorTabs = ({
  colors,
  colorPalette,
  onChange,
}: ChartColorTabsProps): JSX.Element => {
  const [activeTab, setActiveTab] = useState<string>("chart-colors");

  const handleTabChange = (value: string | null) => {
    if (value) {
      setActiveTab(value);
    }
  };

  return (
    <Tabs value={activeTab} onChange={handleTabChange}>
      <Tabs.List>
        <Tabs.Tab value="chart-colors">{t`Chart colors`}</Tabs.Tab>
        <Tabs.Tab value="palette-preview">{t`Preview`}</Tabs.Tab>
      </Tabs.List>

      <Box mt="lg">
        <Tabs.Panel value="chart-colors">
          <ChartColorSettings
            colors={colors}
            colorPalette={colorPalette}
            onChange={onChange}
          />
        </Tabs.Panel>

        <Tabs.Panel value="palette-preview">
          <ChartColorPreview colorPalette={colorPalette} />
        </Tabs.Panel>
      </Box>
    </Tabs>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartColorTabs;
