import { useState } from "react";

import { Warnings } from "metabase/common/components/Warnings";
import CS from "metabase/css/core/index.css";
import { Box, Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";

import { ChartSettingsFooter } from "../ChartSettingsFooter";

import S from "./ChartSettingsVisualization.module.css";
import type { ChartSettingsVisualizationProps } from "./types";

export const ChartSettingsVisualization = ({
  dashboard,
  dashcard,
  onCancel,
  onDone,
  onReset,
  onUpdateVisualizationSettings,
  rawSeries,
  ...stackProps
}: ChartSettingsVisualizationProps) => {
  const [warnings, setWarnings] = useState<string[]>();

  return (
    <Stack pt="lg" {...stackProps}>
      <Warnings className={S.warnings} warnings={warnings} size={20} />
      <Box pos="relative" mx="xxl" flex="1 1 auto">
        <Visualization
          className={CS.spread}
          rawSeries={rawSeries}
          showTitle
          isEditing
          isDashboard
          dashboard={dashboard}
          dashcard={dashcard}
          isSettings
          showWarnings
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
          onUpdateWarnings={setWarnings}
        />
      </Box>
      <ChartSettingsFooter
        onDone={onDone}
        onCancel={onCancel}
        onReset={onReset}
      />
    </Stack>
  );
};
