import { useCallback, useState } from "react";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import Visualization from "metabase/visualizations/components/Visualization";
import { getClickBehaviorSettings } from "metabase/visualizations/lib/settings";
import type { VisualizationSettings } from "metabase-types/api";

import { BaseChartSettings } from "../BaseChartSettings";
import { ChartSettingsFooter } from "../ChartSettingsFooter";
import { useChartSettingsState } from "../hooks";
import type { ChartSettingsWithStateProps } from "../types";

import {
  ChartSettingsPreview,
  ChartSettingsRoot,
  ChartSettingsVisualizationContainer,
  SectionWarnings,
} from "./DashcardChartSettings.styled";

export const DashcardChartSettings = ({
  onChange,
  series,
  isDashboard,
  dashboard,
  dashcard,
  onClose,
  widgets: propWidgets,
}: ChartSettingsWithStateProps) => {
  const [tempSettings, setTempSettings] = useState<VisualizationSettings>();
  const [warnings, setWarnings] = useState();

  const {
    chartSettings,
    chartSettingsRawSeries,
    transformedSeries,
    handleChangeSettings,
    widgets: finalWidgetList,
  } = useChartSettingsState({
    settings: tempSettings,
    series,
    onChange: setTempSettings,
    isDashboard,
    dashboard,
    widgets: propWidgets,
  });

  const handleDone = useCallback(() => {
    onChange?.(chartSettings ?? tempSettings);
    onClose();
  }, [chartSettings, onChange, onClose, tempSettings]);

  const handleResetSettings = useCallback(() => {
    const originalCardSettings = dashcard?.card.visualization_settings;
    const clickBehaviorSettings = getClickBehaviorSettings(chartSettings);

    setTempSettings({
      ...originalCardSettings,
      ...clickBehaviorSettings,
    });
  }, [chartSettings, dashcard?.card.visualization_settings]);

  const onResetToDefault =
    // resetting virtual cards wipes the text and broke the UI (metabase#14644)
    !_.isEqual(chartSettings, {}) && (chartSettings || {}).virtual_card == null
      ? handleResetSettings
      : null;

  return (
    <ChartSettingsRoot className={CS.spread}>
      <BaseChartSettings
        chartSettings={chartSettings}
        onChange={onChange}
        finalWidgetList={finalWidgetList}
        series={series}
        transformedSeries={transformedSeries}
      />
      <ChartSettingsPreview>
        <SectionWarnings warnings={warnings} size={20} />
        <ChartSettingsVisualizationContainer>
          <Visualization
            className={CS.spread}
            rawSeries={chartSettingsRawSeries}
            showTitle
            isEditing
            isDashboard
            dashboard={dashboard}
            dashcard={dashcard}
            isSettings
            showWarnings
            onUpdateVisualizationSettings={handleChangeSettings}
            onUpdateWarnings={setWarnings}
          />
        </ChartSettingsVisualizationContainer>
        <ChartSettingsFooter
          onDone={handleDone}
          onCancel={onClose}
          onReset={onResetToDefault}
        />
      </ChartSettingsPreview>
    </ChartSettingsRoot>
  );
};
