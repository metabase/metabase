import { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import { getClickBehaviorSettings } from "metabase/visualizations/lib/settings";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { VisualizationSettings } from "metabase-types/api";

import { BaseChartSettings } from "../BaseChartSettings";
import { ChartSettingsRoot } from "../ChartSettings.styled";
import { ChartSettingsVisualization } from "../ChartSettingsVisualization";
import { useChartSettingsState } from "../hooks";

import type { DashboardChartSettingsProps } from "./types";

export const DashboardChartSettings = ({
  dashboard,
  dashcard,
  onChange,
  series,
  onClose,
  widgets: propWidgets,
  settings,
}: DashboardChartSettingsProps) => {
  const [tempSettings, setTempSettings] = useState<
    VisualizationSettings | undefined
  >(settings);

  const {
    chartSettings,
    handleChangeSettings,
    chartSettingsRawSeries,
    transformedSeries,
  } = useChartSettingsState({
    series,
    settings: tempSettings,
    onChange: setTempSettings,
  });

  const handleDone = useCallback(() => {
    onChange?.(chartSettings ?? tempSettings ?? {});
    onClose?.();
  }, [chartSettings, onChange, onClose, tempSettings]);

  const handleResetSettings = useCallback(() => {
    const originalCardSettings = dashcard?.card.visualization_settings;
    const clickBehaviorSettings = getClickBehaviorSettings(chartSettings);

    onChange?.({
      ...originalCardSettings,
      ...clickBehaviorSettings,
    });
  }, [chartSettings, dashcard?.card.visualization_settings, onChange]);

  const onResetToDefault =
    // resetting virtual cards wipes the text and broke the UI (metabase#14644)
    !_.isEqual(chartSettings, {}) && (chartSettings || {}).virtual_card == null
      ? handleResetSettings
      : null;

  const widgets = useMemo(
    () =>
      propWidgets ||
      getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        true,
        { dashboardId: dashboard?.id },
      ),
    [propWidgets, transformedSeries, handleChangeSettings, dashboard?.id],
  );

  return (
    <ChartSettingsRoot>
      <BaseChartSettings
        series={series}
        onChange={setTempSettings}
        chartSettings={chartSettings}
        widgets={widgets}
        transformedSeries={transformedSeries}
      />
      <ChartSettingsVisualization
        rawSeries={chartSettingsRawSeries}
        dashboard={dashboard}
        dashcard={dashcard}
        onUpdateVisualizationSettings={handleChangeSettings}
        onDone={handleDone}
        onCancel={() => onClose?.()}
        onReset={onResetToDefault}
      />
    </ChartSettingsRoot>
  );
};
