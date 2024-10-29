import { useState } from "react";

import CS from "metabase/css/core/index.css";
import Visualization from "metabase/visualizations/components/Visualization";

import { ChartSettingsFooter } from "../ChartSettingsFooter";
import type { ChartSettingsVisualizationProps } from "../types";

import {
  ChartSettingsPreview,
  ChartSettingsVisualizationContainer,
  SectionWarnings,
} from "./ChartSettingsVisualization.styled";

export const ChartSettingsVisualization = ({
  dashboard,
  dashcard,
  onCancel,
  onDone,
  onReset,
  onUpdateVisualizationSettings,
  rawSeries,
}: ChartSettingsVisualizationProps) => {
  const [warnings, setWarnings] = useState<string[]>();

  return (
    <ChartSettingsPreview>
      <SectionWarnings warnings={warnings} size={20} />
      <ChartSettingsVisualizationContainer>
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
      </ChartSettingsVisualizationContainer>
      <ChartSettingsFooter
        onDone={onDone}
        onCancel={onCancel}
        onReset={onReset}
      />
    </ChartSettingsPreview>
  );
};
