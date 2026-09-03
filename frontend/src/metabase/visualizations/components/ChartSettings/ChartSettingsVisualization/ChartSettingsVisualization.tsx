import { useRef, useState } from "react";

import CS from "metabase/css/core/index.css";
import { Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { useDashcardSizeTier } from "metabase/visualizations/hooks/use-dashcard-size-tier";

import { ChartSettingsFooter } from "../ChartSettingsFooter";

import {
  ChartSettingsVisualizationContainer,
  SectionWarnings,
} from "./ChartSettingsVisualization.styled";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeTier = useDashcardSizeTier(containerRef);

  return (
    <Stack pt="lg" {...stackProps}>
      <SectionWarnings warnings={warnings} size={20} />
      <ChartSettingsVisualizationContainer ref={containerRef}>
        <Visualization
          className={CS.spread}
          rawSeries={rawSeries}
          showTitle
          isEditing
          isDashboard
          dashboard={dashboard}
          dashcard={dashcard}
          sizeTier={dashcard ? sizeTier : undefined}
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
    </Stack>
  );
};
